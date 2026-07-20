import type { Snowflake } from "./common";
import type { User } from "./user";

export interface Emoji {
  id: Snowflake | null;
  name: string | null;
  roles?: Snowflake[];
  user?: User;
  require_colons?: boolean;
  managed?: boolean;
  animated?: boolean;
  available?: boolean;
}

export type PartialEmoji = Pick<Emoji, "id" | "name"> &
  Partial<Omit<Emoji, "id" | "name">>;
