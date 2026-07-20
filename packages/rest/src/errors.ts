/**
 * An error response from Discord: a 4xx, or a 5xx after retries ran out.
 * `status` is the HTTP status, `code` is Discord's own error code from the
 * body (0 when absent), and `raw` is the parsed body including any
 * field-level detail. Messages never include the token or request body.
 */
export class DiscordError extends Error {
  override readonly name = "DiscordError";

  constructor(
    readonly status: number,
    readonly code: number,
    message: string,
    readonly method: string,
    readonly routeKey: string,
    readonly raw: unknown,
  ) {
    super(`${method} ${routeKey} → ${status} (code ${code}): ${message}`);
  }
}

/**
 * Thrown when a request kept hitting 429s past the retry budget. Ordinarily
 * 429s are absorbed by waiting and retrying; this surfaces only when that
 * budget runs out. `scope` is "user", "global", or "shared"; `global` means
 * the 429 counted against the whole bot rather than one bucket.
 */
export class RateLimitExhaustedError extends Error {
  override readonly name = "RateLimitExhaustedError";

  constructor(
    readonly method: string,
    readonly routeKey: string,
    readonly retryAfterMs: number,
    readonly scope: string,
    readonly global: boolean,
  ) {
    super(
      `${method} ${routeKey} still rate limited after retries ` +
        `(scope=${scope}${global ? ", global" : ""}, last retry_after=${retryAfterMs}ms)`,
    );
  }
}
