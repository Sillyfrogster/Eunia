import { routePath } from "@eunia/rest";
import { toPermissionBits } from "@eunia/types";
import type * as types from "@eunia/types";
import {
  getCachedRole,
  memberCacheKey,
  removeCachedGuildMember,
  resolveCachedRole,
  setCachedRole,
  upsertCachedGuildChannel,
  upsertCachedGuildMember,
  type StructureContext,
} from "../context";
import {
  animatedExtension,
  cdnAssetUrl,
  type CDNImageOptions,
} from "../utils/discord";
import {
  auditLogRequest,
  checkedDeleteMessageSeconds,
  type AuditLogOptions,
} from "../utils/rest";
import { BaseStructure } from "./BaseStructure";
import { Channel } from "./Channel";
import { GuildMember } from "./GuildMember";
import { Role, type RoleEditInput } from "./Role";
import { User } from "./User";

export interface GuildBanInput extends AuditLogOptions {
  deleteMessageSeconds?: number;
}

export type RoleCreateInput = RoleEditInput;

export class Guild extends BaseStructure<types.Guild> {
  constructor(raw: types.Guild, ctx: StructureContext) {
    super(raw, ctx);
  }

  get name(): string {
    return this.raw.name;
  }

  get ownerId(): string {
    return this.raw.owner_id;
  }

  get owner(): User | undefined {
    const raw = this.ctx.cache.users.resolve(this.ownerId);
    return raw === undefined ? undefined : new User(raw, this.ctx);
  }

  get channels(): ReadonlyMap<string, Channel> {
    const channels = new Map<string, Channel>();
    const guild = this.cachedPayload();
    for (const raw of [...(guild.channels ?? []), ...(guild.threads ?? [])]) {
      const channel = new Channel({ ...raw, guild_id: this.id }, this.ctx);
      channels.set(channel.id, channel);
    }
    for (const raw of this.ctx.cache.channels.values()) {
      if (raw.guild_id !== this.id) continue;
      const channel = new Channel(raw, this.ctx);
      channels.set(channel.id, channel);
    }
    return channels;
  }

  get roles(): ReadonlyMap<string, Role> {
    const roles = new Map<string, Role>();
    for (const raw of this.cachedPayload().roles) {
      const role = new Role(raw, this.ctx, this.id);
      roles.set(role.id, role);
    }
    return roles;
  }

  get members(): ReadonlyMap<string, GuildMember> {
    const members = new Map<string, GuildMember>();
    for (const raw of this.cachedPayload().members ?? []) {
      const userId = raw.user?.id;
      if (userId === undefined) continue;
      members.set(userId, new GuildMember(raw, this.ctx, this.id, userId));
    }
    for (const [key, raw] of this.ctx.cache.members.entries()) {
      if (!key.startsWith(`${this.id}:`)) continue;
      const userId = key.slice(this.id.length + 1);
      members.set(userId, new GuildMember(raw, this.ctx, this.id, userId));
    }
    return members;
  }

  iconURL(options: CDNImageOptions = {}): string | undefined {
    const hash = this.raw.icon;
    if (hash === null) return undefined;
    return cdnAssetUrl(["icons", this.id], hash, {
      ...options,
      extension: animatedExtension(hash, options),
    });
  }

  bannerURL(options: CDNImageOptions = {}): string | undefined {
    const hash = this.raw.banner;
    if (hash === null) return undefined;
    return cdnAssetUrl(["banners", this.id], hash, {
      ...options,
      extension: animatedExtension(hash, options),
    });
  }

  splashURL(options: CDNImageOptions = {}): string | undefined {
    const hash = this.raw.splash;
    if (hash === null) return undefined;
    return cdnAssetUrl(["splashes", this.id], hash, options);
  }

  channel(channelId: string): Channel | undefined {
    const raw =
      this.ctx.cache.channels.resolve(channelId) ??
      [...(this.cachedPayload().channels ?? []), ...(this.cachedPayload().threads ?? [])]
        .find((channel) => channel.id === channelId);
    if (raw === undefined || (raw.guild_id !== undefined && raw.guild_id !== this.id)) {
      return undefined;
    }
    return new Channel({ ...raw, guild_id: this.id }, this.ctx);
  }

  member(userId: string): GuildMember | undefined {
    const raw =
      this.ctx.cache.members.resolve(memberCacheKey(this.id, userId)) ??
      this.cachedPayload().members?.find((member) => member.user?.id === userId);
    return raw === undefined
      ? undefined
      : new GuildMember(raw, this.ctx, this.id, userId);
  }

  role(roleId: string): Role | undefined {
    const raw =
      resolveCachedRole(this.ctx, this.id, roleId) ??
      this.cachedPayload().roles.find((role) => role.id === roleId);
    return raw === undefined ? undefined : new Role(raw, this.ctx, this.id);
  }

  async fetchOwner(): Promise<User> {
    const cached = await this.ctx.cache.users.get(this.ownerId);
    if (cached !== undefined) return new User(cached, this.ctx);
    const raw = await this.ctx.rest.get<types.User>(
      routePath("/users/{userId}", { userId: this.ownerId }),
    );
    this.ctx.cache.users.set(raw.id, raw);
    return new User(raw, this.ctx);
  }

  async fetchChannel(channelId: string): Promise<Channel> {
    const cached = await this.ctx.cache.channels.get(channelId);
    if (cached !== undefined && cached.guild_id === this.id) {
      return new Channel(cached, this.ctx);
    }

    const raw = await this.ctx.rest.get<types.Channel>(
      routePath("/channels/{channelId}", { channelId }),
    );
    if (raw.guild_id !== this.id) {
      throw new Error(`Channel ${channelId} does not belong to guild ${this.id}.`);
    }
    upsertCachedGuildChannel(this.ctx, raw);
    return new Channel(raw, this.ctx);
  }

  async fetchMember(userId: string): Promise<GuildMember> {
    const key = memberCacheKey(this.id, userId);
    const cached = await this.ctx.cache.members.get(key);
    if (cached !== undefined) return new GuildMember(cached, this.ctx, this.id, userId);

    const raw = await this.ctx.rest.get<types.GuildMember>(
      routePath("/guilds/{guildId}/members/{userId}", { guildId: this.id, userId }),
    );
    upsertCachedGuildMember(this.ctx, this.id, userId, raw);
    return new GuildMember(raw, this.ctx, this.id, userId);
  }

  async fetchRoles(): Promise<ReadonlyMap<string, Role>> {
    const payload = await this.ctx.rest.get<types.Role[]>(
      routePath("/guilds/{guildId}/roles", { guildId: this.id }),
    );
    const roles = new Map<string, Role>();
    for (const raw of payload) {
      setCachedRole(this.ctx, this.id, raw);
      roles.set(raw.id, new Role(raw, this.ctx, this.id));
    }
    this.updateCachedRoles(payload);
    return roles;
  }

  async fetchRole(roleId: string): Promise<Role> {
    const cached = await getCachedRole(this.ctx, this.id, roleId);
    if (cached !== undefined) return new Role(cached, this.ctx, this.id);
    const roles = await this.fetchRoles();
    const role = roles.get(roleId);
    if (role === undefined) throw new Error(`Role ${roleId} was not found in guild ${this.id}.`);
    return role;
  }

  async ban(userId: string, options: GuildBanInput = {}): Promise<void> {
    const deleteMessageSeconds = checkedDeleteMessageSeconds(
      options.deleteMessageSeconds,
    );
    await this.ctx.rest.put(
      routePath("/guilds/{guildId}/bans/{userId}", { guildId: this.id, userId }),
      {
        ...(deleteMessageSeconds === undefined
          ? {}
          : { delete_message_seconds: deleteMessageSeconds }),
      },
      auditLogRequest(options),
    );
    removeCachedGuildMember(this.ctx, this.id, userId);
  }

  async unban(userId: string, audit: AuditLogOptions = {}): Promise<void> {
    await this.ctx.rest.delete(
      routePath("/guilds/{guildId}/bans/{userId}", { guildId: this.id, userId }),
      auditLogRequest(audit),
    );
  }

  async createRole(
    options: RoleCreateInput = {},
    audit: AuditLogOptions = {},
  ): Promise<Role> {
    const { permissions, unicodeEmoji, ...data } = options;
    const raw = await this.ctx.rest.post<types.Role>(
      routePath("/guilds/{guildId}/roles", { guildId: this.id }),
      {
        ...data,
        ...(permissions === undefined
          ? {}
          : { permissions: toPermissionBits(permissions).toString() }),
        ...(unicodeEmoji === undefined
          ? {}
          : { unicode_emoji: unicodeEmoji }),
      },
      auditLogRequest(audit),
    );
    setCachedRole(this.ctx, this.id, raw);
    this.updateCachedRoles([
      ...(this.ctx.cache.guilds.resolve(this.id)?.roles ?? []).filter(
        (role) => role.id !== raw.id,
      ),
      raw,
    ]);
    return new Role(raw, this.ctx, this.id);
  }

  applicationCommands(applicationId: string): Promise<types.ApplicationCommand[]> {
    return this.ctx.rest.get(
      routePath("/applications/{applicationId}/guilds/{guildId}/commands", {
        applicationId,
        guildId: this.id,
      }),
    );
  }

  createApplicationCommand(
    applicationId: string,
    definition: types.ApplicationCommandDefinition,
  ): Promise<types.ApplicationCommand> {
    const permissions = definition.default_member_permissions;
    const { default_member_permissions: _, ...data } = definition;
    return this.ctx.rest.post(
      routePath("/applications/{applicationId}/guilds/{guildId}/commands", {
        applicationId,
        guildId: this.id,
      }),
      {
        ...data,
        ...(permissions === undefined
          ? {}
          : permissions === null
            ? { default_member_permissions: null }
            : { default_member_permissions: toPermissionBits(permissions).toString() }),
      },
    );
  }

  private updateCachedRoles(roles: types.Role[]): void {
    const cached = this.ctx.cache.guilds.resolve(this.id);
    if (cached !== undefined) this.ctx.cache.guilds.set(this.id, { ...cached, roles });
  }

  private cachedPayload(): types.Guild {
    return this.ctx.cache.guilds.resolve(this.id) ?? this.raw;
  }
}
