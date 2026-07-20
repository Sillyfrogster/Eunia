/**
 * Eunia's own tunables. Every value here is a choice this library makes;
 * values Discord defines live in constants.ts.
 */

/** A socket that hasn't sent HELLO after this long is considered dead. */
export const HELLO_TIMEOUT_MS = 30_000;

/**
 * How long to wait for a close handshake before declaring the close
 * locally. On a dead network the handshake never completes.
 */
export const FORCE_CLOSE_GRACE_MS = 5_000;

/** Reconnect backoff: 1s, 2s, 4s… capped, plus random jitter. */
export const RECONNECT_BASE_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 30_000;
export const RECONNECT_JITTER_MAX_MS = 1_000;

/**
 * The close code used when the shard kills a dead connection itself.
 * Codes 1000/1001 would tell Discord to discard the session; any other
 * code keeps it resumable.
 */
export const ZOMBIE_CLOSE_CODE = 3001;

/** Send-budget slots only heartbeats may use (~2 beats fit in a window; 5 is a margin). */
export const HEARTBEAT_RESERVED_SLOTS = 5;
