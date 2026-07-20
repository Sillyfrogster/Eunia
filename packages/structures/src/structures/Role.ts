import { routePath } from "@eunia/rest";
import { toPermissionBits } from "@eunia/types";
import type * as types from "@eunia/types";
import type { StructureContext } from "../context";
import { cdnAssetUrl, type CDNImageOptions } from "../utils/discord";
import { auditLogRequest, type AuditLogOptions } from "../utils/rest";
import { BaseStructure } from "./BaseStructure";
import { Guild } from "./Guild";

export interface RoleEditInput {
  name?: string;
  permissions?: types.PermissionInput;
  color?: number;
  hoist?: boolean;
  icon?: string | null;
  unicodeEmoji?: string | null;
  mentionable?: boolean;
}

export class Role extends BaseStructure<types.Role> {
  constructor(
    raw: types.Role,
    ctx: StructureContext,
    readonly guildId: string,
  ) {
    super(raw, ctx);
  }

  get name(): string {
    return this.raw.name;
  }

  get mention(): string {
    return `<@&${this.id}>`;
  }

  get permissions(): bigint {
    return BigInt(this.raw.permissions);
  }

  get guild(): Guild | undefined {
    const raw = this.ctx.cache.guilds.resolve(this.guildId);
    return raw === undefined ? undefined : new Guild(raw, this.ctx);
  }

  iconURL(options: CDNImageOptions = {}): string | undefined {
    const hash = this.raw.icon;
    return hash === null ? undefined : cdnAssetUrl(["role-icons", this.id], hash, options);
  }

  async fetchGuild(): Promise<Guild> {
    const cached = await this.ctx.cache.guilds.get(this.guildId);
    if (cached !== undefined) return new Guild(cached, this.ctx);
    const raw = await this.ctx.rest.get<types.Guild>(
      routePath("/guilds/{guildId}", { guildId: this.guildId }),
    );
    this.ctx.cache.guilds.set(raw.id, raw);
    return new Guild(raw, this.ctx);
  }

  async edit(
    options: RoleEditInput,
    audit: AuditLogOptions = {},
  ): Promise<Role> {
    const { permissions, unicodeEmoji, ...data } = options;
    const raw = await this.ctx.rest.patch<types.Role>(
      routePath("/guilds/{guildId}/roles/{roleId}", {
        guildId: this.guildId,
        roleId: this.id,
      }),
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
    this.ctx.cache.roles.set(raw.id, raw);
    this.updateCachedGuildRoles((roles) => [
      ...roles.filter((role) => role.id !== raw.id),
      raw,
    ]);
    return new Role(raw, this.ctx, this.guildId);
  }

  async delete(audit: AuditLogOptions = {}): Promise<void> {
    await this.ctx.rest.delete(
      routePath("/guilds/{guildId}/roles/{roleId}", {
        guildId: this.guildId,
        roleId: this.id,
      }),
      auditLogRequest(audit),
    );
    this.ctx.cache.roles.delete(this.id);
    this.updateCachedGuildRoles((roles) => roles.filter((role) => role.id !== this.id));
  }

  private updateCachedGuildRoles(update: (roles: types.Role[]) => types.Role[]): void {
    const guild = this.ctx.cache.guilds.resolve(this.guildId);
    if (guild !== undefined) {
      this.ctx.cache.guilds.set(this.guildId, { ...guild, roles: update(guild.roles) });
    }
  }
}
