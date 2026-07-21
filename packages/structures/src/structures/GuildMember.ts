import { routePath } from "@eunia/rest";
import { can, canAny, missing, type PermissionFlagName, type Snowflake } from "@eunia/types";
import type * as types from "@eunia/types";
import {
  memberCacheKey,
  removeCachedGuildMember,
  resolveCachedRole,
  setCachedGuild,
  upsertCachedGuildMember,
  type StructureContext,
} from "../context";
import {
  animatedExtension,
  cdnAssetUrl,
  snowflakeTimestamp,
  type CDNImageOptions,
} from "../utils/discord";
import { ALL_PERMISSION_BITS } from "../utils/permissions";
import {
  auditLogRequest,
  checkedDeleteMessageSeconds,
  type AuditLogOptions,
} from "../utils/rest";
import { freezeSnapshot } from "./BaseStructure";
import { Guild } from "./Guild";
import { Role } from "./Role";
import { User } from "./User";

export interface MemberEditInput extends AuditLogOptions {
  nickname?: string | null;
  roles?: readonly Snowflake[];
  mute?: boolean;
  deaf?: boolean;
  channelId?: Snowflake | null;
  communicationDisabledUntil?: Date | number | string | null;
}

export interface BanInput extends AuditLogOptions {
  deleteMessageSeconds?: number;
}

export class GuildMember {
  readonly raw: Readonly<types.GuildMember>;

  constructor(
    raw: types.GuildMember,
    private readonly ctx: StructureContext,
    readonly guildId: string,
    readonly id: string = raw.user?.id ?? "",
  ) {
    if (id.length === 0) {
      throw new TypeError("GuildMember requires a user id.");
    }
    this.raw = freezeSnapshot(raw);
  }

  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  get joinedAt(): Date | undefined {
    return this.raw.joined_at === null ? undefined : new Date(this.raw.joined_at);
  }

  get mention(): string {
    return `<@${this.id}>`;
  }

  get user(): User | undefined {
    const raw = this.raw.user ?? this.ctx.cache.users.resolve(this.id);
    return raw === undefined ? undefined : new User(raw, this.ctx);
  }

  get guild(): Guild | undefined {
    const raw = this.ctx.cache.guilds.resolve(this.guildId);
    return raw === undefined ? undefined : new Guild(raw, this.ctx);
  }

  get displayName(): string {
    return this.raw.nick ?? this.user?.displayName ?? this.id;
  }

  /** The interaction-provided channel permissions when present, guild-wide otherwise. */
  get permissions(): bigint {
    if (this.raw.permissions !== undefined) return BigInt(this.raw.permissions);
    return this.guildPermissions;
  }

  /** Guild-wide permissions from cached roles; the owner holds every flag. */
  get guildPermissions(): bigint {
    const guild = this.ctx.cache.guilds.resolve(this.guildId);
    if (guild?.owner_id === this.id) return ALL_PERMISSION_BITS;

    let bitfield = 0n;
    const roleIds = new Set([this.guildId, ...this.raw.roles]);
    for (const roleId of roleIds) {
      const role = resolveCachedRole(this.ctx, this.guildId, roleId) ??
        guild?.roles.find((candidate) => candidate.id === roleId);
      if (role !== undefined) bitfield |= BigInt(role.permissions);
    }
    return bitfield;
  }

  /** Returns true when the member holds every flag in `required`. */
  can(required: bigint): boolean {
    return can(this.permissions, required);
  }

  /** Returns true when the member holds at least one flag in `anyOf`. */
  canAny(anyOf: bigint): boolean {
    return canAny(this.permissions, anyOf);
  }

  /** Names the flags in `required` that the member lacks. */
  missing(required: bigint): PermissionFlagName[] {
    return missing(this.permissions, required);
  }

  get roles(): ReadonlyMap<string, Role> {
    const roles = new Map<string, Role>();
    const guild = this.ctx.cache.guilds.resolve(this.guildId);
    for (const roleId of new Set([this.guildId, ...this.raw.roles])) {
      const raw =
        resolveCachedRole(this.ctx, this.guildId, roleId) ??
        guild?.roles.find((candidate) => candidate.id === roleId);
      if (raw !== undefined) roles.set(roleId, new Role(raw, this.ctx, this.guildId));
    }
    return roles;
  }

  get highestRole(): Role | undefined {
    let highest: Role | undefined;
    for (const role of this.roles.values()) {
      if (highest === undefined || role.raw.position > highest.raw.position) {
        highest = role;
      }
    }
    return highest;
  }

  displayAvatarURL(options: CDNImageOptions = {}): string | undefined {
    const hash = this.raw.avatar;
    if (hash == null) return this.user?.displayAvatarURL(options);
    return cdnAssetUrl(["guilds", this.guildId, "users", this.id, "avatars"], hash, {
      ...options,
      extension: animatedExtension(hash, options),
    });
  }

  async fetchUser(): Promise<User> {
    if (this.raw.user !== undefined) return new User(this.raw.user, this.ctx);
    const cached = await this.ctx.cache.users.get(this.id);
    if (cached !== undefined) return new User(cached, this.ctx);

    const raw = await this.ctx.rest.get<types.User>(
      routePath("/users/{userId}", { userId: this.id }),
    );
    this.ctx.cache.users.set(raw.id, raw);
    return new User(raw, this.ctx);
  }

  async fetchGuild(): Promise<Guild> {
    const cached = await this.ctx.cache.guilds.get(this.guildId);
    if (cached !== undefined) return new Guild(cached, this.ctx);

    const raw = await this.ctx.rest.get<types.Guild>(
      routePath("/guilds/{guildId}", { guildId: this.guildId }),
    );
    setCachedGuild(this.ctx, raw);
    return new Guild(raw, this.ctx);
  }

  async edit(options: MemberEditInput): Promise<GuildMember> {
    const raw = await this.ctx.rest.patch<types.GuildMember>(
      routePath("/guilds/{guildId}/members/{userId}", {
        guildId: this.guildId,
        userId: this.id,
      }),
      {
        ...(options.nickname === undefined ? {} : { nick: options.nickname }),
        ...(options.roles === undefined ? {} : { roles: options.roles }),
        ...(options.mute === undefined ? {} : { mute: options.mute }),
        ...(options.deaf === undefined ? {} : { deaf: options.deaf }),
        ...(options.channelId === undefined ? {} : { channel_id: options.channelId }),
        ...(options.communicationDisabledUntil === undefined
          ? {}
          : {
              communication_disabled_until:
                options.communicationDisabledUntil === null
                  ? null
                  : new Date(options.communicationDisabledUntil).toISOString(),
            }),
      },
      auditLogRequest(options),
    );
    this.cacheMember(raw);
    return new GuildMember(raw, this.ctx, this.guildId, this.id);
  }

  setNickname(
    nickname: string | null,
    audit: AuditLogOptions = {},
  ): Promise<GuildMember> {
    return this.edit({ nickname, ...audit });
  }

  timeout(
    until: Date | number | string | null,
    audit: AuditLogOptions = {},
  ): Promise<GuildMember> {
    return this.edit({ communicationDisabledUntil: until, ...audit });
  }

  async kick(audit: AuditLogOptions = {}): Promise<void> {
    await this.ctx.rest.delete(
      routePath("/guilds/{guildId}/members/{userId}", {
        guildId: this.guildId,
        userId: this.id,
      }),
      auditLogRequest(audit),
    );
    removeCachedGuildMember(this.ctx, this.guildId, this.id);
  }

  async ban(options: BanInput = {}): Promise<void> {
    const checkedSeconds = checkedDeleteMessageSeconds(
      options.deleteMessageSeconds,
    );
    await this.ctx.rest.put(
      routePath("/guilds/{guildId}/bans/{userId}", {
        guildId: this.guildId,
        userId: this.id,
      }),
      {
        ...(checkedSeconds === undefined
          ? {}
          : { delete_message_seconds: checkedSeconds }),
      },
      auditLogRequest(options),
    );
    removeCachedGuildMember(this.ctx, this.guildId, this.id);
  }

  async addRole(role: string | Role, audit: AuditLogOptions = {}): Promise<void> {
    const roleId = typeof role === "string" ? role : role.id;
    await this.ctx.rest.put(
      routePath("/guilds/{guildId}/members/{userId}/roles/{roleId}", {
        guildId: this.guildId,
        userId: this.id,
        roleId,
      }),
      undefined,
      auditLogRequest(audit),
    );
    const raw = this.cachedPayload();
    if (!raw.roles.includes(roleId)) {
      upsertCachedGuildMember(this.ctx, this.guildId, this.id, {
        ...raw,
        roles: [...raw.roles, roleId],
      });
    }
  }

  async removeRole(
    role: string | Role,
    audit: AuditLogOptions = {},
  ): Promise<void> {
    const roleId = typeof role === "string" ? role : role.id;
    await this.ctx.rest.delete(
      routePath("/guilds/{guildId}/members/{userId}/roles/{roleId}", {
        guildId: this.guildId,
        userId: this.id,
        roleId,
      }),
      auditLogRequest(audit),
    );
    const raw = this.cachedPayload();
    upsertCachedGuildMember(this.ctx, this.guildId, this.id, {
      ...raw,
      roles: raw.roles.filter((id) => id !== roleId),
    });
  }

  toJSON(): types.GuildMember {
    return structuredClone(this.raw) as types.GuildMember;
  }

  private cacheMember(raw: types.GuildMember): void {
    upsertCachedGuildMember(this.ctx, this.guildId, this.id, raw);
  }

  private cachedPayload(): types.GuildMember {
    return (
      this.ctx.cache.members.resolve(memberCacheKey(this.guildId, this.id)) ??
      this.toJSON()
    );
  }
}
