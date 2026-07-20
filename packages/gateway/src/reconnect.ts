import { SESSION_DEAD_CLOSE_CODES } from "./constants";
import {
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_JITTER_MAX_MS,
  RECONNECT_MAX_DELAY_MS,
} from "./policy";

/** What the next reconnect should do: resume or start over, and after how long. */
export interface ReconnectPlan {
  resume: boolean;
  delayMs: number;
}

/**
 * Decides how to come back from a dropped connection. A server-sent
 * 1000/1001 ends the session despite being "clean" codes, so those
 * re-identify. Backoff doubles per attempt up to the cap; jitter spreads
 * bots out so mass reconnects don't retry in sync.
 */
export function planReconnect(
  code: number,
  attempt: number,
  hasSession: boolean,
): ReconnectPlan {
  const sessionDead =
    code === 1000 || code === 1001 || SESSION_DEAD_CLOSE_CODES.has(code);
  const backoff = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
    RECONNECT_MAX_DELAY_MS,
  );
  return {
    resume: !sessionDead && hasSession,
    delayMs: Math.round(backoff + Math.random() * RECONNECT_JITTER_MAX_MS),
  };
}
