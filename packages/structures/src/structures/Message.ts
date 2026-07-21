import { routePath } from "@eunia/rest";
import type * as types from "@eunia/types";
import {
  setCachedGuild,
  upsertCachedGuildChannel,
  type StructureContext,
} from "../context";
import type { Sendable } from "../utils/messages";
import { normalizeSendable, splitMessageFiles } from "../utils/messages";
import { BaseStructure } from "./BaseStructure";
import { Channel } from "./Channel";
import { Guild } from "./Guild";
import { User } from "./User";

export class Message extends BaseStructure<types.Message> {
  readonly author: User;

  constructor(raw: types.Message, ctx: StructureContext) {
    super(raw, ctx);
    this.author = new User(raw.author, ctx);
  }

  get content(): string {
    return this.raw.content;
  }

  get channelId(): string {
    return this.raw.channel_id;
  }

  get guildId(): string | undefined {
    return this.raw.guild_id;
  }

  get editedAt(): Date | undefined {
    return this.raw.edited_timestamp === null
      ? undefined
      : new Date(this.raw.edited_timestamp);
  }

  get channel(): Channel | undefined {
    const raw = this.ctx.cache.channels.resolve(this.channelId);
    return raw === undefined ? undefined : new Channel(raw, this.ctx);
  }

  get guild(): Guild | undefined {
    const guildId = this.guildId;
    if (guildId === undefined) return undefined;
    const raw = this.ctx.cache.guilds.resolve(guildId);
    return raw === undefined ? undefined : new Guild(raw, this.ctx);
  }

  get url(): string {
    return `https://discord.com/channels/${this.guildId ?? "@me"}/${this.channelId}/${this.id}`;
  }

  async fetchChannel(): Promise<Channel> {
    const cached = await this.ctx.cache.channels.get(this.channelId);
    if (cached !== undefined) return new Channel(cached, this.ctx);

    const raw = await this.ctx.rest.get<types.Channel>(
      routePath("/channels/{channelId}", { channelId: this.channelId }),
    );
    upsertCachedGuildChannel(this.ctx, raw);
    return new Channel(raw, this.ctx);
  }

  async fetchGuild(): Promise<Guild | undefined> {
    const guildId = this.guildId;
    if (guildId === undefined) return undefined;
    const cached = await this.ctx.cache.guilds.get(guildId);
    if (cached !== undefined) return new Guild(cached, this.ctx);

    const raw = await this.ctx.rest.get<types.Guild>(
      routePath("/guilds/{guildId}", { guildId }),
    );
    setCachedGuild(this.ctx, raw);
    return new Guild(raw, this.ctx);
  }

  async reply(input: Sendable): Promise<Message> {
    const body = normalizeSendable(input);
    const request = splitMessageFiles({
      ...body,
      message_reference: {
        ...body.message_reference,
        message_id: this.id,
        channel_id: this.channelId,
        ...(this.guildId === undefined ? {} : { guild_id: this.guildId }),
      },
    });
    const raw = await this.ctx.rest.post<types.Message>(
      routePath("/channels/{channelId}/messages", { channelId: this.channelId }),
      request.body,
      request.files === undefined ? {} : { files: request.files },
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  async edit(input: Sendable): Promise<Message> {
    const request = splitMessageFiles(normalizeSendable(input, "edit"));
    const raw = await this.ctx.rest.patch<types.Message>(
      routePath("/channels/{channelId}/messages/{messageId}", {
        channelId: this.channelId,
        messageId: this.id,
      }),
      request.body,
      request.files === undefined ? {} : { files: request.files },
    );
    this.cacheMessage(raw);
    return new Message(raw, this.ctx);
  }

  async delete(): Promise<void> {
    await this.ctx.rest.delete(
      routePath("/channels/{channelId}/messages/{messageId}", {
        channelId: this.channelId,
        messageId: this.id,
      }),
    );
    this.ctx.cache.messages.delete(this.id);
  }

  async react(emoji: string): Promise<void> {
    if (emoji.length === 0) throw new TypeError("A reaction emoji cannot be empty.");
    await this.ctx.rest.put(
      routePath("/channels/{channelId}/messages/{messageId}/reactions/{emoji}/@me", {
        channelId: this.channelId,
        messageId: this.id,
        emoji,
      }),
    );
  }

  async removeOwnReaction(emoji: string): Promise<void> {
    if (emoji.length === 0) throw new TypeError("A reaction emoji cannot be empty.");
    await this.ctx.rest.delete(
      routePath("/channels/{channelId}/messages/{messageId}/reactions/{emoji}/@me", {
        channelId: this.channelId,
        messageId: this.id,
        emoji,
      }),
    );
  }

  async pin(): Promise<void> {
    await this.ctx.rest.put(
      routePath("/channels/{channelId}/messages/pins/{messageId}", {
        channelId: this.channelId,
        messageId: this.id,
      }),
    );
    this.cachePinnedState(true);
  }

  async unpin(): Promise<void> {
    await this.ctx.rest.delete(
      routePath("/channels/{channelId}/messages/pins/{messageId}", {
        channelId: this.channelId,
        messageId: this.id,
      }),
    );
    this.cachePinnedState(false);
  }

  private cacheMessage(raw: types.Message): void {
    this.ctx.cache.messages.set(raw.id, raw);
    this.ctx.cache.users.set(raw.author.id, raw.author);
  }

  private cachePinnedState(pinned: boolean): void {
    const raw = this.ctx.cache.messages.resolve(this.id) ?? this.toJSON();
    this.ctx.cache.messages.set(this.id, { ...raw, pinned });
  }
}
