import type { Snowflake } from "./common";
import type { User } from "./user";

export interface SoundboardSound {
  name: string;
  sound_id: Snowflake;
  volume: number;
  emoji_id: Snowflake | null;
  emoji_name: string | null;
  guild_id?: Snowflake;
  available: boolean;
  user?: User;
}
