import type { Snowflake } from "./common";
import type { User } from "./user";

export enum StickerType {
  Standard = 1,
  Guild = 2,
}

export enum StickerFormatType {
  PNG = 1,
  APNG = 2,
  Lottie = 3,
  GIF = 4,
}

export interface Sticker {
  id: Snowflake;
  pack_id?: Snowflake;
  name: string;
  description: string | null;
  tags: string;
  type: StickerType;
  format_type: StickerFormatType;
  available?: boolean;
  guild_id?: Snowflake;
  user?: User;
  sort_value?: number;
}

export interface StickerItem {
  id: Snowflake;
  name: string;
  format_type: StickerFormatType;
}

export interface StickerPack {
  id: Snowflake;
  stickers: Sticker[];
  name: string;
  sku_id: Snowflake;
  cover_sticker_id?: Snowflake;
  description: string;
  banner_asset_id?: Snowflake;
}
