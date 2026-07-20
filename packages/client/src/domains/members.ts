import { routePath } from "@eunia/rest";
import {
  GuildMember,
  memberCacheKey,
  removeCachedGuildMember,
  upsertCachedGuildMember,
  type AuditLogOptions,
  type BanInput,
  type MemberEditInput,
  type StructureContext,
} from "@eunia/structures";
import type * as types from "@eunia/types";
import { requireId } from "./cached";

/** Guild member cache accessors and REST operations. */
export class MembersDomain {
  constructor(private readonly ctx: StructureContext) {}

  async get(guildId: string, userId: string): Promise<GuildMember> {
    requireId(guildId, userId);
    const cached = await this.ctx.cache.members.get(memberCacheKey(guildId, userId));
    if (cached !== undefined) return new GuildMember(cached, this.ctx, guildId, userId);
    return this.pull(guildId, userId);
  }

  peek(guildId: string, userId: string): GuildMember | undefined {
    const raw = this.ctx.cache.members.resolve(memberCacheKey(guildId, userId));
    return raw === undefined ? undefined : new GuildMember(raw, this.ctx, guildId, userId);
  }

  async pull(guildId: string, userId: string): Promise<GuildMember> {
    requireId(guildId, userId);
    const raw = await this.ctx.rest.get<types.GuildMember>(
      routePath("/guilds/{guildId}/members/{userId}", { guildId, userId }),
    );
    upsertCachedGuildMember(this.ctx, guildId, userId, raw);
    return new GuildMember(raw, this.ctx, guildId, userId);
  }

  edit(
    guildId: string,
    userId: string,
    input: MemberEditInput,
  ): Promise<GuildMember> {
    return this.hydrated(guildId, userId).then((member) => member.edit(input));
  }

  async kick(guildId: string, userId: string, audit: AuditLogOptions = {}): Promise<void> {
    requireId(guildId, userId);
    await this.ctx.rest.delete(
      routePath("/guilds/{guildId}/members/{userId}", { guildId, userId }),
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
    removeCachedGuildMember(this.ctx, guildId, userId);
  }

  async ban(guildId: string, userId: string, input: BanInput = {}): Promise<void> {
    requireId(guildId, userId);
    const seconds = input.deleteMessageSeconds;
    if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0 || seconds > 604_800)) {
      throw new RangeError("Deleted message history must be between 0 and 604800 seconds.");
    }
    await this.ctx.rest.put(
      routePath("/guilds/{guildId}/bans/{userId}", { guildId, userId }),
      seconds === undefined ? {} : { delete_message_seconds: seconds },
      input.reason === undefined ? {} : { reason: input.reason },
    );
    removeCachedGuildMember(this.ctx, guildId, userId);
  }

  async unban(guildId: string, userId: string, audit: AuditLogOptions = {}): Promise<void> {
    requireId(guildId, userId);
    await this.ctx.rest.delete(
      routePath("/guilds/{guildId}/bans/{userId}", { guildId, userId }),
      audit.reason === undefined ? {} : { reason: audit.reason },
    );
  }

  async addRole(
    guildId: string,
    userId: string,
    roleId: string,
    audit: AuditLogOptions = {},
  ): Promise<void> {
    const member = await this.hydrated(guildId, userId);
    await member.addRole(roleId, audit);
  }

  async removeRole(
    guildId: string,
    userId: string,
    roleId: string,
    audit: AuditLogOptions = {},
  ): Promise<void> {
    const member = await this.hydrated(guildId, userId);
    await member.removeRole(roleId, audit);
  }

  private hydrated(guildId: string, userId: string): Promise<GuildMember> {
    requireId(guildId, userId);
    return this.get(guildId, userId);
  }
}
