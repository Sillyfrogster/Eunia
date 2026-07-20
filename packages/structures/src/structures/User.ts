import { routePath } from "@eunia/rest";
import type * as types from "@eunia/types";
import type { StructureContext } from "../context";
import {
  CDN_BASE_URL,
  animatedExtension,
  cdnAssetUrl,
  type CDNImageOptions,
} from "../utils/discord";
import type { Sendable } from "../utils/messages";
import { BaseStructure } from "./BaseStructure";
import { Channel } from "./Channel";
import { Message } from "./Message";

export class User extends BaseStructure<types.User> {
  constructor(raw: types.User, ctx: StructureContext) {
    super(raw, ctx);
  }

  get username(): string {
    return this.raw.username;
  }

  get displayName(): string {
    return this.raw.global_name ?? this.raw.username;
  }

  get isBot(): boolean {
    return this.raw.bot === true;
  }

  get mention(): string {
    return `<@${this.id}>`;
  }

  get tag(): string {
    return this.raw.discriminator === "0"
      ? this.raw.username
      : `${this.raw.username}#${this.raw.discriminator}`;
  }

  avatarURL(options: CDNImageOptions = {}): string | undefined {
    const hash = this.raw.avatar;
    if (hash === null) return undefined;
    return cdnAssetUrl(["avatars", this.id], hash, {
      ...options,
      extension: animatedExtension(hash, options),
    });
  }

  displayAvatarURL(options: CDNImageOptions = {}): string {
    return this.avatarURL(options) ?? this.defaultAvatarURL;
  }

  get defaultAvatarURL(): string {
    const discriminator = this.raw.discriminator;
    const index =
      discriminator === "0"
        ? Number((BigInt(this.id) >> 22n) % 6n)
        : Number(discriminator) % 5;
    return `${CDN_BASE_URL}/embed/avatars/${Number.isFinite(index) ? index : 0}.png`;
  }

  bannerURL(options: CDNImageOptions = {}): string | undefined {
    const hash = this.raw.banner;
    if (hash == null) return undefined;
    return cdnAssetUrl(["banners", this.id], hash, {
      ...options,
      extension: animatedExtension(hash, options),
    });
  }

  async createDM(): Promise<Channel> {
    const raw = await this.ctx.rest.post<types.Channel>(
      routePath("/users/@me/channels"),
      { recipient_id: this.id },
    );
    this.ctx.cache.channels.set(raw.id, raw);
    return new Channel(raw, this.ctx);
  }

  async send(input: Sendable): Promise<Message> {
    const channel = await this.createDM();
    return channel.send(input);
  }
}
