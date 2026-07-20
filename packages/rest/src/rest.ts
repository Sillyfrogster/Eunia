import { createLogger, type Logger } from "@eunia/shared";
import { Bucket, sleep } from "./bucket";
import {
  API_VERSION,
  DEFAULT_BASE_URL,
  DEFAULT_BUCKET_TTL_MS,
  DEFAULT_GLOBAL_REQUESTS_PER_SECOND,
  DEFAULT_INVALID_REQUEST_WARNING,
  DEFAULT_MAX_BUCKETS,
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  INVALID_REQUEST_WINDOW_MS,
  RETRYABLE_STATUS_CODES,
  RETRY_BACKOFF_BASE_MS,
  RateLimitHeaders,
} from "./constants";
import { DiscordError, RateLimitExhaustedError } from "./errors";
import { GlobalLimiter } from "./global-limiter";
import type { RoutePath } from "./routes";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** A bound route, or a raw path string as the last-resort trapdoor. */
export type RequestPath = string | RoutePath;

function trapdoorRoute(path: string): RoutePath {
  const bare = path.split("?", 1)[0] ?? path;
  return { path, template: bare, majorParam: bare };
}

export interface RestFile {
  data: Blob | ArrayBuffer | ArrayBufferView;
  name: string;
  description?: string;
}

export interface RestRequestOptions {
  body?: unknown;
  files?: readonly RestFile[];
  auth?: boolean;
  global?: boolean;
  reason?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  idempotent?: boolean;
}

/** Configures the HTTP client. */
export interface RestOptions {
  token: string;
  version?: number;
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  globalRequestsPerSecond?: number;
  maxBuckets?: number;
  bucketTtlMs?: number;
  invalidRequestWarning?: number;
  onInvalidRequestWarning?: (count: number) => void;
  logger?: Logger;
  fetch?: typeof fetch;
}

export interface RestDiagnostics {
  readonly buckets: number;
  readonly learnedRoutes: number;
  readonly invalidRequests: number;
}

interface RateLimit429Body {
  retry_after?: number;
  global?: boolean;
}

interface ResolvedRestOptions {
  version: number;
  baseUrl: string;
  userAgent: string;
  timeoutMs: number;
  retries: number;
  globalRequestsPerSecond: number;
  maxBuckets: number;
  bucketTtlMs: number;
  invalidRequestWarning: number;
  onInvalidRequestWarning: ((count: number) => void) | undefined;
  fetch: typeof fetch;
}

interface HashEntry {
  hash: string;
  lastUsedAt: number;
}

interface RequestContext {
  method: HttpMethod;
  path: string;
  routeKey: string;
  majorParam: string;
  bucket: Bucket;
  options: RestRequestOptions;
}

function copyBytes(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const source =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

/** Sends authenticated, rate-limited requests to Discord. */
export class EuniaRest {
  private readonly log: Logger;
  private readonly buckets = new Map<string, Bucket>();
  private readonly hashes = new Map<string, HashEntry>();
  private readonly botGlobal: GlobalLimiter;
  private readonly ipGlobal: GlobalLimiter;
  private readonly unrestricted = new GlobalLimiter(Number.POSITIVE_INFINITY);
  private readonly token: string;
  private readonly opts: ResolvedRestOptions;
  private readonly invalidRequests: number[] = [];
  private requestCount = 0;
  private warnedInvalidCount = 0;

  constructor(options: RestOptions) {
    this.log = options.logger ?? createLogger("rest");
    const token = (options.token ?? "").trim();
    if (token.length === 0) throw new Error("EuniaRest requires a bot token.");
    if (/\s/.test(token)) throw new Error("The bot token contains whitespace.");
    this.token = token;

    this.opts = {
      version: options.version ?? API_VERSION,
      baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: options.retries ?? DEFAULT_RETRIES,
      globalRequestsPerSecond:
        options.globalRequestsPerSecond ?? DEFAULT_GLOBAL_REQUESTS_PER_SECOND,
      maxBuckets: options.maxBuckets ?? DEFAULT_MAX_BUCKETS,
      bucketTtlMs: options.bucketTtlMs ?? DEFAULT_BUCKET_TTL_MS,
      invalidRequestWarning:
        options.invalidRequestWarning ?? DEFAULT_INVALID_REQUEST_WARNING,
      onInvalidRequestWarning: options.onInvalidRequestWarning,
      fetch: options.fetch ?? fetch,
    };
    this.validateOptions();
    this.botGlobal = new GlobalLimiter(this.opts.globalRequestsPerSecond);
    this.ipGlobal = new GlobalLimiter(this.opts.globalRequestsPerSecond);
  }

  get diagnostics(): RestDiagnostics {
    this.pruneInvalidRequests(Date.now());
    return {
      buckets: this.buckets.size,
      learnedRoutes: this.hashes.size,
      invalidRequests: this.invalidRequests.length,
    };
  }

  get<T = unknown>(
    path: RequestPath,
    options: Omit<RestRequestOptions, "body" | "files"> = {},
  ): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  post<T = unknown>(
    path: RequestPath,
    body?: unknown,
    options: Omit<RestRequestOptions, "body"> = {},
  ): Promise<T> {
    return this.request<T>("POST", path, { ...options, ...(body === undefined ? {} : { body }) });
  }

  patch<T = unknown>(
    path: RequestPath,
    body?: unknown,
    options: Omit<RestRequestOptions, "body"> = {},
  ): Promise<T> {
    return this.request<T>("PATCH", path, { ...options, ...(body === undefined ? {} : { body }) });
  }

  put<T = unknown>(
    path: RequestPath,
    body?: unknown,
    options: Omit<RestRequestOptions, "body"> = {},
  ): Promise<T> {
    return this.request<T>("PUT", path, { ...options, ...(body === undefined ? {} : { body }) });
  }

  delete<T = unknown>(
    path: RequestPath,
    options: RestRequestOptions = {},
  ): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }

  request<T = unknown>(
    method: HttpMethod,
    path: RequestPath,
    options: RestRequestOptions = {},
  ): Promise<T> {
    const route = typeof path === "string" ? trapdoorRoute(path) : path;
    if (!route.path.startsWith("/")) {
      throw new Error(`REST paths must start with "/": ${route.path}`);
    }
    options.signal?.throwIfAborted();

    const auth = options.auth !== false;
    const useGlobal = options.global ?? true;
    const mode = useGlobal ? (auth ? "bot" : "ip") : "free";
    const limiter = useGlobal
      ? auth
        ? this.botGlobal
        : this.ipGlobal
      : this.unrestricted;
    const scopedRouteKey = `${mode}:${method}:${route.template}`;
    const bucket = this.bucketFor(scopedRouteKey, route.majorParam, limiter);
    this.sweepBucketsIfNeeded();

    const pending = bucket.enqueue(() =>
      this.execute({
        method,
        path: route.path,
        routeKey: scopedRouteKey,
        majorParam: route.majorParam,
        bucket,
        options,
      }),
    ) as Promise<T>;
    void pending.then(
      () => this.sweepAfterRequest(),
      () => this.sweepAfterRequest(),
    );
    return pending;
  }

  private validateOptions(): void {
    if (!Number.isInteger(this.opts.version) || this.opts.version < 1) {
      throw new RangeError("REST version must be a positive integer.");
    }
    for (const [name, value] of [
      ["timeoutMs", this.opts.timeoutMs],
      ["maxBuckets", this.opts.maxBuckets],
      ["bucketTtlMs", this.opts.bucketTtlMs],
      ["globalRequestsPerSecond", this.opts.globalRequestsPerSecond],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be greater than zero.`);
      }
    }
    if (!Number.isInteger(this.opts.retries) || this.opts.retries < 0) {
      throw new RangeError("retries must be a non-negative integer.");
    }
    if (!Number.isSafeInteger(this.opts.globalRequestsPerSecond)) {
      throw new RangeError("globalRequestsPerSecond must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(this.opts.maxBuckets)) {
      throw new RangeError("maxBuckets must be a positive safe integer.");
    }
    if (
      !Number.isSafeInteger(this.opts.invalidRequestWarning) ||
      this.opts.invalidRequestWarning < 1
    ) {
      throw new RangeError("invalidRequestWarning must be a positive safe integer.");
    }
  }

  private bucketFor(routeKey: string, majorParam: string, limiter: GlobalLimiter): Bucket {
    const learned = this.hashes.get(routeKey);
    if (learned) learned.lastUsedAt = Date.now();
    const key = learned
      ? `${routeKey.split(":", 1)[0]}:${learned.hash}:${majorParam}`
      : `${routeKey}:${majorParam}`;
    const existing = this.buckets.get(key);
    if (existing) return existing;

    const bucket = new Bucket(key, limiter);
    this.buckets.set(key, bucket);
    return bucket;
  }

  private async execute(context: RequestContext): Promise<unknown> {
    const { method, path, routeKey, majorParam, bucket, options } = context;
    const url = `${this.opts.baseUrl}/v${this.opts.version}${path}`;
    const requestBody = this.prepareBody(options.body, options.files);
    const headers: Record<string, string> = {};
    new Headers(options.headers).forEach((value, name) => {
      headers[name] = value;
    });
    headers["user-agent"] = this.opts.userAgent;
    if (options.auth !== false) headers["authorization"] = `Bot ${this.token}`;
    if (options.reason !== undefined) {
      if (options.reason.length > 512) throw new RangeError("Audit log reasons cannot exceed 512 characters.");
      headers["x-audit-log-reason"] = encodeURIComponent(options.reason);
    }
    if (requestBody.contentType) headers["content-type"] = requestBody.contentType;

    const retryUnsafe = options.idempotent === true;
    const mayRetryFailure = method !== "POST" || retryUnsafe;

    for (let attempt = 0; ; attempt += 1) {
      options.signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(this.opts.timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      const init: RequestInit = { method, headers, signal };
      if (requestBody.body !== undefined) init.body = requestBody.body;

      let response: Response;
      try {
        response = await this.opts.fetch(url, init);
      } catch (error) {
        if (options.signal?.aborted || attempt >= this.opts.retries || !mayRetryFailure) {
          throw error;
        }
        const backoff = RETRY_BACKOFF_BASE_MS * 2 ** attempt;
        this.log.warn(`${method} ${routeKey} failed; retrying in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }

      this.observe(response, routeKey, majorParam, bucket);
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        this.recordInvalidRequest();
      }

      if (response.status === 429) {
        const details = await this.read429(response);
        if (details.global) {
          (options.auth === false ? this.ipGlobal : this.botGlobal).blockFor(
            details.retryAfterMs,
          );
        }
        if (attempt >= this.opts.retries) {
          throw new RateLimitExhaustedError(
            method,
            routeKey,
            details.retryAfterMs,
            details.scope,
            details.global,
          );
        }
        this.log.warn(`${method} ${routeKey} was rate limited; waiting ${details.retryAfterMs}ms`);
        await sleep(details.retryAfterMs);
        continue;
      }

      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        if (attempt < this.opts.retries && mayRetryFailure) {
          const backoff = RETRY_BACKOFF_BASE_MS * 2 ** attempt;
          this.log.warn(`${method} ${routeKey} returned ${response.status}; retrying in ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
        throw await this.intoApiError(response, method, routeKey);
      }

      if (!response.ok) throw await this.intoApiError(response, method, routeKey);
      return this.parseBody(response);
    }
  }

  private prepareBody(
    body: unknown,
    files: readonly RestFile[] | undefined,
  ): { body: BodyInit | undefined; contentType: string | undefined } {
    if (!files || files.length === 0) {
      return {
        body: body === undefined ? undefined : JSON.stringify(body),
        contentType: body === undefined ? undefined : "application/json",
      };
    }

    const payload =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? { ...(body as Record<string, unknown>) }
        : {};
    const nestedData = payload["data"];
    const attachmentTarget =
      typeof payload["type"] === "number" &&
      typeof nestedData === "object" &&
      nestedData !== null &&
      !Array.isArray(nestedData)
        ? { ...(nestedData as Record<string, unknown>) }
        : payload;
    if (attachmentTarget !== payload) payload["data"] = attachmentTarget;

    if (!("attachments" in attachmentTarget)) {
      attachmentTarget["attachments"] = files.map((file, index) => ({
        id: String(index),
        filename: file.name,
        ...(file.description === undefined ? {} : { description: file.description }),
      }));
    }

    const form = new FormData();
    form.set("payload_json", JSON.stringify(payload));
    files.forEach((file, index) => {
      const blob = file.data instanceof Blob ? file.data : new Blob([copyBytes(file.data)]);
      form.set(`files[${index}]`, blob, file.name);
    });
    return { body: form, contentType: undefined };
  }

  private observe(
    response: Response,
    routeKey: string,
    majorParam: string,
    bucket: Bucket,
  ): void {
    const target = this.reconcileBucket(response.headers, routeKey, majorParam, bucket);
    const rawLimit = response.headers.get(RateLimitHeaders.Limit);
    const rawRemaining = response.headers.get(RateLimitHeaders.Remaining);
    const rawResetAfter = response.headers.get(RateLimitHeaders.ResetAfter);
    if (rawLimit === null || rawRemaining === null || rawResetAfter === null) return;
    const limit = Number(rawLimit);
    const remaining = Number(rawRemaining);
    const resetAfter = Number(rawResetAfter);
    if (Number.isFinite(limit) && Number.isFinite(remaining) && Number.isFinite(resetAfter)) {
      target.observe(limit, remaining, Math.max(0, resetAfter * 1_000));
    }
  }

  private reconcileBucket(
    headers: Headers,
    routeKey: string,
    majorParam: string,
    bucket: Bucket,
  ): Bucket {
    const hash = headers.get(RateLimitHeaders.Bucket);
    if (hash === null) return bucket;

    this.hashes.set(routeKey, { hash, lastUsedAt: Date.now() });
    const mode = routeKey.split(":", 1)[0] ?? "bot";
    const sharedKey = `${mode}:${hash}:${majorParam}`;
    const existing = this.buckets.get(sharedKey);
    if (existing && existing !== bucket) {
      bucket.redirectTo(existing);
      if (this.buckets.get(bucket.key) === bucket) this.buckets.delete(bucket.key);
      return existing;
    }

    if (this.buckets.get(bucket.key) === bucket) this.buckets.delete(bucket.key);
    bucket.key = sharedKey;
    this.buckets.set(sharedKey, bucket);
    return bucket;
  }

  private async read429(response: Response): Promise<{
    retryAfterMs: number;
    scope: string;
    global: boolean;
  }> {
    const raw = await this.parseBody(response);
    const body = typeof raw === "object" && raw !== null ? (raw as RateLimit429Body) : {};
    const header = response.headers.get(RateLimitHeaders.RetryAfter);
    const seconds =
      typeof body.retry_after === "number"
        ? body.retry_after
        : header === null || header === ""
          ? Number.NaN
          : Number(header);
    return {
      retryAfterMs: Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds * 1_000)) : 1_000,
      scope: response.headers.get(RateLimitHeaders.Scope) ?? "user",
      global:
        response.headers.has(RateLimitHeaders.Global) ||
        body.global === true,
    };
  }

  private async parseBody(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 205) return undefined;
    if (response.headers.get("content-length") === "0") return undefined;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json")) return response.json().catch(() => undefined);
    return response.text().catch(() => undefined);
  }

  private async intoApiError(
    response: Response,
    method: HttpMethod,
    routeKey: string,
  ): Promise<DiscordError> {
    const raw = await this.parseBody(response);
    const body = typeof raw === "object" && raw !== null
      ? (raw as { code?: number; message?: string })
      : {};
    return new DiscordError(
      response.status,
      typeof body.code === "number" ? body.code : 0,
      typeof body.message === "string" ? body.message : response.statusText,
      method,
      routeKey,
      raw,
    );
  }

  private recordInvalidRequest(): void {
    const now = Date.now();
    this.invalidRequests.push(now);
    this.pruneInvalidRequests(now);
    const count = this.invalidRequests.length;
    if (
      count >= this.opts.invalidRequestWarning &&
      count >= this.warnedInvalidCount + 100
    ) {
      this.warnedInvalidCount = count;
      this.opts.onInvalidRequestWarning?.(count);
      if (!this.opts.onInvalidRequestWarning) {
        this.log.warn(`${count} invalid requests were sent in the last 10 minutes`);
      }
    }
  }

  private sweepBucketsIfNeeded(): void {
    this.requestCount += 1;
    if (
      this.requestCount % 256 !== 0 &&
      this.buckets.size <= this.opts.maxBuckets &&
      this.hashes.size <= this.opts.maxBuckets
    ) {
      return;
    }

    this.sweepBuckets();
  }

  private sweepAfterRequest(): void {
    if (
      this.buckets.size > this.opts.maxBuckets ||
      this.hashes.size > this.opts.maxBuckets
    ) {
      this.sweepBuckets();
    }
  }

  private sweepBuckets(): void {
    const cutoff = Date.now() - this.opts.bucketTtlMs;
    for (const [key, bucket] of this.buckets) {
      if (bucket.isIdle && bucket.lastUsedAt < cutoff) this.buckets.delete(key);
    }
    for (const [key, entry] of this.hashes) {
      if (entry.lastUsedAt < cutoff) this.hashes.delete(key);
    }

    if (this.hashes.size > this.opts.maxBuckets) {
      const oldest = [...this.hashes.entries()]
        .sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)
        .slice(0, this.hashes.size - this.opts.maxBuckets);
      for (const [key] of oldest) this.hashes.delete(key);
    }

    if (this.buckets.size <= this.opts.maxBuckets) return;
    const idle = [...this.buckets.entries()]
      .filter(([, bucket]) => bucket.isIdle)
      .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
    const remove = this.buckets.size - this.opts.maxBuckets;
    for (let index = 0; index < remove; index += 1) {
      const candidate = idle[index];
      if (candidate) this.buckets.delete(candidate[0]);
    }
  }

  private pruneInvalidRequests(now: number): void {
    while (
      this.invalidRequests[0] !== undefined &&
      this.invalidRequests[0] <= now - INVALID_REQUEST_WINDOW_MS
    ) {
      this.invalidRequests.shift();
    }
    if (this.invalidRequests.length < this.opts.invalidRequestWarning) {
      this.warnedInvalidCount = 0;
    }
  }
}
