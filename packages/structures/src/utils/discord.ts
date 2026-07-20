export const DISCORD_EPOCH = 1_420_070_400_000;
export const CDN_BASE_URL = "https://cdn.discordapp.com";

export type ImageExtension = "png" | "jpeg" | "webp" | "gif";

export interface CDNImageOptions {
  extension?: ImageExtension;
  size?: 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096;
}

export function snowflakeTimestamp(snowflake: string): number {
  if (!/^\d+$/.test(snowflake)) {
    throw new TypeError(`Invalid snowflake "${snowflake}".`);
  }

  const value = BigInt(snowflake);
  if (value > (1n << 64n) - 1n) {
    throw new RangeError("A snowflake cannot exceed 64 bits.");
  }

  return Number((value >> 22n) + BigInt(DISCORD_EPOCH));
}

export function cdnAssetUrl(
  path: readonly string[],
  hash: string,
  options: CDNImageOptions = {},
): string {
  if (hash.length === 0) {
    throw new TypeError("A CDN asset hash cannot be empty.");
  }
  if (path.length === 0 || path.some((part) => part.length === 0)) {
    throw new TypeError("CDN path parts cannot be empty.");
  }

  const extension = options.extension ?? "webp";
  const encodedPath = path.map(encodeURIComponent).join("/");
  const url = new URL(`${CDN_BASE_URL}/${encodedPath}/${encodeURIComponent(hash)}.${extension}`);
  if (options.size !== undefined) url.searchParams.set("size", String(options.size));
  return url.toString();
}

export function animatedExtension(
  hash: string,
  options: CDNImageOptions,
): ImageExtension {
  return options.extension ?? (hash.startsWith("a_") ? "gif" : "webp");
}
