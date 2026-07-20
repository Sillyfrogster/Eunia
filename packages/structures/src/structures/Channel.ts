import { routePath } from "@eunia/rest";
import { ChannelType, OverwriteType, can, PermissionFlags } from "@eunia/types";
import type * as types from "@eunia/types";
import {
  removeCachedGuildChannel,
  upsertCachedGuildChannel,
  type StructureContext,
} from "../context";
import type { Sendable } from "../utils/messages";
import { normalizeSendable, splitMessageFiles } from "../utils/messages";
import { ALL_PERMISSION_BITS } from "../utils/permissions";
import { auditLogRequest, type AuditLogOptions } from "../utils/rest";
import { BaseStructure } from "./BaseStructure";
import { Guild } from "./Guild";
import { GuildMember } from "./GuildMember";
import { Message } from "./Message";

export type ChannelEditInput = Partial<
  Pick<
    types.Channel,
    | "name"
    | "position"
    | "topic"
    | "nsfw"
    | "rate_limit_per_user"
    | "bitrate"
    | "user_limit"
    | "permission_overwrites"
    | "parent_id"
    | "rtc_region"
    | "video_quality_mode"
    | "default_auto_archive_duration"
    | "flags"
    | "available_tags"
    | "default_reaction_emoji"
    | "default_thread_rate_limit_per_user"
    | "default_sort_order"
    | "default_forum_layout"
    | "applied_tags"
  >
>;

export class Channel extends BaseStructure<types.Channel> {
  constructor(raw: types.Channel, ctx: StructureContext) {
    super(raw, ctx);
  }

  get name(): string | null | undefined {
    return this.raw.name;
  }

  get topic(): string | null | undefined {
    return this.raw.topic;
  }

  get guildId(): string | undefined {
    return this.raw.guild_id;
  }

  get mention(): string {
    return `<#${this.id}>`;
  }

  get isDM(): boolean {
    return this.raw.type === ChannelType.DM || this.raw.type === ChannelType.GroupDM;
  }

  get isThread(): boolean {
    return (
      this.raw.type === ChannelType.AnnouncementThread ||
      this.raw.type === ChannelType.PublicThread ||
      this.raw.type === ChannelType.PrivateThread
    );
  }

  get isTextBased(): boolean {
    return (
      this.isDM ||
      this.isThread ||
      this.raw.type === ChannelType.GuildText ||
      this.raw.type === ChannelType.GuildAnnouncement ||
      this.raw.type === ChannelType.GuildVoice
    );
  }

  /** Computes the member's effective permission bitfield in this channel. */
  permissionsFor(member: GuildMember): bigint {
    const guildId = this.guildId;
    if (guildId === undefined || member.guildId !== guildId) {
      throw new Error("Channel permissions need a member from the same guild.");
    }

    if (this.isThread && this.raw.parent_id !== undefined && this.raw.parent_id !== null) {
      const parent = this.ctx.cache.channels.resolve(this.raw.parent_id);
      if (parent !== undefined) return new Channel(parent, this.ctx).permissionsFor(member);
    }

    let permissions = member.guildPermissions;
    if (can(permissions, PermissionFlags.Administrator)) return ALL_PERMISSION_BITS;

    const overwrites = this.raw.permission_overwrites ?? [];
    const everyone = overwrites.find(
      (overwrite) => overwrite.type === OverwriteType.Role && overwrite.id === guildId,
    );
    if (everyone !== undefined) {
      permissions = applyOverwrite(permissions, everyone.allow, everyone.deny);
    }

    const memberRoles = new Set(member.raw.roles);
    let roleAllow = 0n;
    let roleDeny = 0n;
    for (const overwrite of overwrites) {
      if (overwrite.type !== OverwriteType.Role || !memberRoles.has(overwrite.id)) continue;
      roleAllow |= BigInt(overwrite.allow);
      roleDeny |= BigInt(overwrite.deny);
    }
    permissions = (permissions & ~roleDeny) | roleAllow;

    const memberOverwrite = overwrites.find(
      (overwrite) => overwrite.type === OverwriteType.Member && overwrite.id === member.id,
    );
    if (memberOverwrite !== undefined) {
      permissions = applyOverwrite(
        permissions,
        memberOverwrite.allow,
        memberOverwrite.deny,
      );
    }
    return permissions;
  }

  get guild(): Guild | undefined {
    const guildId = this.guildId;
    if (guildId === undefined) return undefined;
    const raw = this.ctx.cache.guilds.resolve(guildId);
    return raw === undefined ? undefined : new Guild(raw, this.ctx);
  }

  async fetchGuild(): Promise<Guild | undefined> {
    const guildId = this.guildId;
    if (guildId === undefined) return undefined;
    const raw = await this.ctx.cache.guilds.get(guildId);
    if (raw !== undefined) return new Guild(raw, this.ctx);

    const fetched = await this.ctx.rest.get<types.Guild>(
      routePath("/guilds/{guildId}", { guildId }),
    );
    this.ctx.cache.guilds.set(guildId, fetched);
    return new Guild(fetched, this.ctx);
  }

  async send(input: Sendable): Promise<Message> {
    const request = splitMessageFiles(normalizeSendable(input));
    const raw = await this.ctx.rest.post<types.Message>(
      routePath("/channels/{channelId}/messages", { channelId: this.id }),
      request.body,
      request.files === undefined ? {} : { files: request.files },
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  async fetchMessage(messageId: string): Promise<Message> {
    const cached = await this.ctx.cache.messages.get(messageId);
    if (cached !== undefined && cached.channel_id === this.id) {
      return new Message(cached, this.ctx);
    }

    const raw = await this.ctx.rest.get<types.Message>(
      routePath("/channels/{channelId}/messages/{messageId}", {
        channelId: this.id,
        messageId,
      }),
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  async edit(
    options: ChannelEditInput,
    audit: AuditLogOptions = {},
  ): Promise<Channel> {
    const raw = await this.ctx.rest.patch<types.Channel>(
      routePath("/channels/{channelId}", { channelId: this.id }),
      options,
      auditLogRequest(audit),
    );
    upsertCachedGuildChannel(this.ctx, raw);
    return new Channel(raw, this.ctx);
  }

  updateTopic(topic: string | null): Promise<Channel> {
    return this.edit({ topic });
  }

  async delete(audit: AuditLogOptions = {}): Promise<Channel> {
    const raw = await this.ctx.rest.delete<types.Channel>(
      routePath("/channels/{channelId}", { channelId: this.id }),
      auditLogRequest(audit),
    );
    removeCachedGuildChannel(this.ctx, raw.guild_id ?? this.guildId, this.id);
    return new Channel(raw, this.ctx);
  }

  async triggerTyping(): Promise<void> {
    await this.ctx.rest.post(
      routePath("/channels/{channelId}/typing", { channelId: this.id }),
    );
  }

  private cacheMessage(raw: types.Message): void {
    this.ctx.cache.messages.set(raw.id, raw);
    this.ctx.cache.users.set(raw.author.id, raw.author);
  }
}

function applyOverwrite(permissions: bigint, allow: `${bigint}`, deny: `${bigint}`): bigint {
  return (permissions & ~BigInt(deny)) | BigInt(allow);
}
