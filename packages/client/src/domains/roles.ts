import { routePath } from "@eunia/rest";
import { toPermissionBits } from "@eunia/types";
import {
  Role,
  getCachedRole,
  resolveCachedRole,
  setCachedRole,
  type AuditLogOptions,
  type RoleEditInput,
  type StructureContext,
} from "@eunia/structures";
import type * as types from "@eunia/types";
import { requireId } from "./cached";

/** Role cache accessors and REST operations. */
export class RolesDomain {
  constructor(private readonly ctx: StructureContext) {}

  async get(guildId: string, roleId: string): Promise<Role> {
    requireId(guildId, roleId);
    const cached = await getCachedRole(this.ctx, guildId, roleId);
    if (cached !== undefined) return new Role(cached, this.ctx, guildId);

    const roles = await this.list(guildId);
    const role = roles.get(roleId);
    if (role === undefined) {
      throw new Error(`Role ${roleId} was not found in guild ${guildId}.`);
    }
    return role;
  }

  peek(guildId: string, roleId: string): Role | undefined {
    const raw = resolveCachedRole(this.ctx, guildId, roleId);
    return raw === undefined ? undefined : new Role(raw, this.ctx, guildId);
  }

  async pull(guildId: string, roleId: string): Promise<Role> {
    requireId(guildId, roleId);
    const roles = await this.list(guildId);
    const role = roles.get(roleId);
    if (role === undefined) {
      throw new Error(`Role ${roleId} was not found in guild ${guildId}.`);
    }
    return role;
  }

  async list(guildId: string): Promise<ReadonlyMap<string, Role>> {
    requireId(guildId);
    const payload = await this.ctx.rest.get<types.Role[]>(
      routePath("/guilds/{guildId}/roles", { guildId }),
    );
    const roles = new Map<string, Role>();
    for (const raw of payload) {
      setCachedRole(this.ctx, guildId, raw);
      roles.set(raw.id, new Role(raw, this.ctx, guildId));
    }
    return roles;
  }

  async create(
    guildId: string,
    input: RoleEditInput = {},
    audit: AuditLogOptions = {},
  ): Promise<Role> {
    requireId(guildId);
    const raw = await this.ctx.rest.post<types.Role>(
      routePath("/guilds/{guildId}/roles", { guildId }),
      serializeRoleInput(input),
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
    setCachedRole(this.ctx, guildId, raw);
    return new Role(raw, this.ctx, guildId);
  }

  async edit(
    guildId: string,
    roleId: string,
    input: RoleEditInput,
    audit: AuditLogOptions = {},
  ): Promise<Role> {
    requireId(guildId, roleId);
    const raw = await this.ctx.rest.patch<types.Role>(
      routePath("/guilds/{guildId}/roles/{roleId}", { guildId, roleId }),
      serializeRoleInput(input),
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
    setCachedRole(this.ctx, guildId, raw);
    return new Role(raw, this.ctx, guildId);
  }

  async delete(guildId: string, roleId: string, audit: AuditLogOptions = {}): Promise<void> {
    requireId(guildId, roleId);
    await this.ctx.rest.delete(
      routePath("/guilds/{guildId}/roles/{roleId}", { guildId, roleId }),
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
    this.ctx.cache.roles.delete(roleId);
  }
}

function serializeRoleInput(input: RoleEditInput): Record<string, unknown> {
  const { permissions, unicodeEmoji, ...data } = input;
  return {
    ...data,
    ...(permissions === undefined
      ? {}
      : { permissions: toPermissionBits(permissions).toString() }),
    ...(unicodeEmoji === undefined ? {} : { unicode_emoji: unicodeEmoji }),
  };
}
