import { GATEWAY_SEND_LIMIT, GATEWAY_SEND_WINDOW_MS } from "./constants";
import { HEARTBEAT_RESERVED_SLOTS } from "./policy";

/** Tracks one connection's rolling outbound budget and heartbeat reserve. */
export class GatewaySendLimiter {
  private readonly sentAt: number[] = [];
  private firstLive = 0;

  constructor(private readonly now: () => number = Date.now) {}

  allowanceMs(isHeartbeat: boolean): number {
    const now = this.now();
    this.removeExpired(now);
    const budget = isHeartbeat
      ? GATEWAY_SEND_LIMIT
      : GATEWAY_SEND_LIMIT - HEARTBEAT_RESERVED_SLOTS;
    if (this.sentAt.length - this.firstLive < budget) return 0;
    return Math.max(
      1,
      (this.sentAt[this.firstLive] ?? now) + GATEWAY_SEND_WINDOW_MS - now,
    );
  }

  recordSend(): void {
    const now = this.now();
    this.removeExpired(now);
    this.sentAt.push(now);
  }

  private removeExpired(now: number): void {
    while (
      this.sentAt[this.firstLive] !== undefined &&
      this.sentAt[this.firstLive]! <= now - GATEWAY_SEND_WINDOW_MS
    ) {
      this.firstLive += 1;
    }
    if (this.firstLive > 1_024 && this.firstLive * 2 > this.sentAt.length) {
      this.sentAt.splice(0, this.firstLive);
      this.firstLive = 0;
    }
  }
}
