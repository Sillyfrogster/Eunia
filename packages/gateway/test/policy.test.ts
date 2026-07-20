import { describe, expect, test } from "bun:test";
import {
  GATEWAY_SEND_LIMIT,
  GATEWAY_SEND_WINDOW_MS,
} from "../src/constants";
import { HEARTBEAT_RESERVED_SLOTS } from "../src/policy";
import { planReconnect } from "../src/reconnect";
import { HeartbeatMonitor } from "../src/heartbeat";
import { GatewaySendLimiter } from "../src/send-limiter";

describe("GatewaySendLimiter", () => {
  test("keeps reserved capacity for heartbeats", () => {
    const limiter = new GatewaySendLimiter();
    const normalBudget = GATEWAY_SEND_LIMIT - HEARTBEAT_RESERVED_SLOTS;
    for (let sent = 0; sent < normalBudget; sent += 1) {
      expect(limiter.allowanceMs(false)).toBe(0);
      limiter.recordSend();
    }

    expect(limiter.allowanceMs(false)).toBeGreaterThan(0);
    expect(limiter.allowanceMs(true)).toBe(0);

    for (let sent = 0; sent < HEARTBEAT_RESERVED_SLOTS; sent += 1) {
      limiter.recordSend();
    }
    expect(limiter.allowanceMs(true)).toBeGreaterThan(0);
  });

  test("reports a delay within the current window", () => {
    const limiter = new GatewaySendLimiter();
    for (let sent = 0; sent < GATEWAY_SEND_LIMIT; sent += 1) limiter.recordSend();
    expect(limiter.allowanceMs(true)).toBeGreaterThan(0);
    expect(limiter.allowanceMs(true)).toBeLessThanOrEqual(GATEWAY_SEND_WINDOW_MS);
  });

  test("does not reset a burst at a local window boundary", () => {
    let now = 0;
    const limiter = new GatewaySendLimiter(() => now);
    now = GATEWAY_SEND_WINDOW_MS - 1;
    for (let sent = 0; sent < GATEWAY_SEND_LIMIT; sent += 1) {
      limiter.recordSend();
    }

    now = GATEWAY_SEND_WINDOW_MS;
    expect(limiter.allowanceMs(true)).toBe(GATEWAY_SEND_WINDOW_MS - 1);
    now = GATEWAY_SEND_WINDOW_MS * 2 - 1;
    expect(limiter.allowanceMs(true)).toBe(0);
  });
});

describe("HeartbeatMonitor", () => {
  test("answers requested heartbeats while an acknowledgement is pending", () => {
    let sent = 0;
    let zombies = 0;
    const monitor = new HeartbeatMonitor({
      intervalMs: 60_000,
      sendHeartbeat: () => {
        sent += 1;
      },
      onZombie: () => {
        zombies += 1;
      },
    });

    monitor.beatNow();
    monitor.beatNow();
    monitor.stop();

    expect(sent).toBe(2);
    expect(zombies).toBe(0);
  });
});

describe("planReconnect", () => {
  test("resumes live sessions and replaces dead sessions", () => {
    expect(planReconnect(1006, 1, true).resume).toBe(true);
    expect(planReconnect(4007, 1, true).resume).toBe(false);
    expect(planReconnect(4009, 1, true).resume).toBe(false);
    expect(planReconnect(1000, 1, true).resume).toBe(false);
    expect(planReconnect(1006, 1, false).resume).toBe(false);
  });

  test("caps exponential backoff", () => {
    const early = planReconnect(1006, 1, true).delayMs;
    const late = planReconnect(1006, 100, true).delayMs;
    expect(early).toBeLessThan(late);
    expect(late).toBeLessThanOrEqual(31_000);
  });
});
