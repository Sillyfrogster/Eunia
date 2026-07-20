/**
 * Constants for Discord's REST API (v10). Protocol values are defined by
 * Discord; library defaults are Eunia's and can all be overridden
 * through `RestOptions`.
 */

/** REST API version, the `/v10` in every request URL. */
export const API_VERSION = 10;

/**
 * The rate-limit headers Discord attaches to every response, not just 429s.
 *
 * `ResetAfter` is used instead of the absolute `x-ratelimit-reset` because it
 * does not depend on clock sync. On 429s the body's `retry_after` is more
 * precise than the whole-second `RetryAfter` header.
 */
export const RateLimitHeaders = {
  Limit: "x-ratelimit-limit",
  Remaining: "x-ratelimit-remaining",
  ResetAfter: "x-ratelimit-reset-after",
  Bucket: "x-ratelimit-bucket",
  Global: "x-ratelimit-global",
  Scope: "x-ratelimit-scope",
  RetryAfter: "retry-after",
} as const;

/**
 * The bot-wide ceiling: 50 requests/second across all buckets. Large bots
 * can request a higher limit from Discord, so it's configurable.
 */
export const DEFAULT_GLOBAL_REQUESTS_PER_SECOND = 50;

/** Base URL for the API. Overridable for tests or proxies. */
export const DEFAULT_BASE_URL = "https://discord.com/api";

/** Discord requires the shape `DiscordBot ($url, $version)`. */
export const DEFAULT_USER_AGENT =
  "DiscordBot (https://github.com/Sillyfrogster/Eunia, 0.1.0-alpha.1)";

/**
 * Abort a request with no response after this long, so a hung connection
 * can't block its bucket's queue.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** How many times one request may be retried (network failure, 5xx, 429). */
export const DEFAULT_RETRIES = 3;

export const DEFAULT_BUCKET_TTL_MS = 10 * 60_000;
export const DEFAULT_MAX_BUCKETS = 10_000;
export const INVALID_REQUEST_LIMIT = 10_000;
export const INVALID_REQUEST_WINDOW_MS = 10 * 60_000;
export const DEFAULT_INVALID_REQUEST_WARNING = 8_000;

/** First retry waits this long; doubles per attempt. */
export const RETRY_BACKOFF_BASE_MS = 500;

/**
 * Server-side failures that are safe to retry. 4xx responses never are:
 * the request itself was wrong, and repeated invalid requests count toward
 * Discord's limit of 10,000 per 10 minutes before a temporary IP ban.
 */
export const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([
  500, 502, 503, 504,
]);
