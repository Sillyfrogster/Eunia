import type { CacheAdapter } from "./adapter";
import { assertTtl } from "./memory";

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, px: "PX", milliseconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(
    cursor: string | number,
    match: "MATCH",
    pattern: string,
    count: "COUNT",
    hint: number,
  ): Promise<[string, string[]]>;
  close(): void | Promise<void>;
}

export interface RedisCacheAdapterOptions {
  url?: string;
  prefix?: string;
  client?: RedisClientLike;
}

const DEFAULT_PREFIX = "eunia";
const SCAN_COUNT = 250;

export class RedisCacheAdapter implements CacheAdapter {
  readonly prefix: string;

  private readonly client: RedisClientLike;

  constructor(options: RedisCacheAdapterOptions = {}) {
    this.prefix = normalizePrefix(options.prefix ?? DEFAULT_PREFIX);
    this.client =
      options.client ??
      (options.url === undefined
        ? new Bun.RedisClient()
        : new Bun.RedisClient(options.url));
  }

  async get(namespace: string, key: string): Promise<unknown | undefined> {
    const value = await this.client.get(this.key(namespace, key));
    return value === null ? undefined : JSON.parse(value);
  }

  async set(
    namespace: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<void> {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new TypeError("Cache values must be JSON serializable.");
    }

    if (ttl === undefined) {
      await this.client.set(this.key(namespace, key), encoded);
      return;
    }

    assertTtl(ttl);
    await this.client.set(this.key(namespace, key), encoded, "PX", ttl);
  }

  async delete(namespace: string, key: string): Promise<void> {
    await this.client.del(this.key(namespace, key));
  }

  async keys(namespace: string, prefix = ""): Promise<string[]> {
    const namespacePrefix = this.namespacePrefix(namespace);
    const pattern = `${namespacePrefix}${encodeKey(prefix)}*`;
    const keys: string[] = [];
    let cursor = "0";

    do {
      const [nextCursor, page] = await this.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        SCAN_COUNT,
      );
      cursor = nextCursor;
      for (const key of page) {
        const encoded = key.slice(namespacePrefix.length);
        const decoded = decodeKey(encoded);
        if (decoded !== undefined) keys.push(decoded);
      }
    } while (cursor !== "0");

    return keys;
  }

  async clear(namespace: string): Promise<void> {
    const pattern = `${this.namespacePrefix(namespace)}*`;
    let cursor = "0";

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        SCAN_COUNT,
      );
      cursor = nextCursor;

      for (let offset = 0; offset < keys.length; offset += SCAN_COUNT) {
        await this.client.del(...keys.slice(offset, offset + SCAN_COUNT));
      }
    } while (cursor !== "0");
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  private key(namespace: string, key: string): string {
    return `${this.namespacePrefix(namespace)}${encodeKey(key)}`;
  }

  private namespacePrefix(namespace: string): string {
    return `${this.prefix}:${encodePart(namespace)}:`;
  }
}

export class ValkeyCacheAdapter extends RedisCacheAdapter {}

function normalizePrefix(prefix: string): string {
  const normalized = prefix.replace(/:+$/u, "");
  if (!/^[a-z0-9._-]+$/iu.test(normalized)) {
    throw new TypeError(
      "Redis cache prefixes may contain letters, numbers, dots, dashes, and underscores.",
    );
  }
  return normalized;
}

function encodePart(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = `${bytes.length.toString(36)}-`;
  for (const byte of bytes) encoded += byte.toString(16).padStart(2, "0");
  return encoded;
}

function encodeKey(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = "k";
  for (const byte of bytes) encoded += byte.toString(16).padStart(2, "0");
  return encoded;
}

function decodeKey(value: string): string | undefined {
  if (!value.startsWith("k") || value.length % 2 !== 1) return undefined;
  const bytes = new Uint8Array((value.length - 1) / 2);
  for (let index = 1; index < value.length; index += 2) {
    const byte = Number.parseInt(value.slice(index, index + 2), 16);
    if (!Number.isFinite(byte)) return undefined;
    bytes[(index - 1) / 2] = byte;
  }
  return new TextDecoder().decode(bytes);
}
