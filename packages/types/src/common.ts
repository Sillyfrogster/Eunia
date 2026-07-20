export type Snowflake = string;
export type BitfieldString = `${bigint}`;
export type ISO8601Timestamp = string;
export type Awaitable<T> = T | PromiseLike<T>;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Locale =
  | "id"
  | "da"
  | "de"
  | "en-GB"
  | "en-US"
  | "es-ES"
  | "es-419"
  | "fr"
  | "hr"
  | "it"
  | "lt"
  | "hu"
  | "nl"
  | "no"
  | "pl"
  | "pt-BR"
  | "ro"
  | "fi"
  | "sv-SE"
  | "vi"
  | "tr"
  | "cs"
  | "el"
  | "bg"
  | "ru"
  | "uk"
  | "hi"
  | "th"
  | "zh-CN"
  | "ja"
  | "zh-TW"
  | "ko";

export type Localizations = Partial<Record<Locale, string | null>>;
