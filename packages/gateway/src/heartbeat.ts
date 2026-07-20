/**
 * Runs the heartbeat loop for one gateway connection.
 *
 * An unacknowledged heartbeat means the connection is dead even though the
 * socket still looks open. This class owns only timers; the Shard supplies
 * the send and dead-connection callbacks.
 */
export class HeartbeatMonitor {
  private awaitingAck = false;
  private lastBeatSentAt: number | null = null;
  private lastLatencyMs: number | null = null;
  private firstBeatTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: HeartbeatMonitorOptions) {}

  /**
   * Starts the loop. Call once, right after HELLO.
   *
   * Discord requires the first beat to be delayed by a random fraction of the
   * interval so mass reconnects don't heartbeat in sync.
   */
  start(): void {
    this.stop();

    const jitteredFirstDelay = this.options.intervalMs * Math.random();
    this.firstBeatTimer = setTimeout(() => {
      this.beat();
      this.intervalTimer = setInterval(() => this.beat(), this.options.intervalMs);
    }, jitteredFirstDelay);
  }

  /** Stops all timers. Call on any disconnect. */
  stop(): void {
    if (this.firstBeatTimer !== null) clearTimeout(this.firstBeatTimer);
    if (this.intervalTimer !== null) clearInterval(this.intervalTimer);
    this.firstBeatTimer = null;
    this.intervalTimer = null;
    this.awaitingAck = false;
  }

  /** Sends a beat immediately, outside the normal rhythm. Used when Discord requests one. */
  beatNow(): void {
    this.sendBeat();
  }

  /** Records that the heartbeat ack arrived. */
  ack(): void {
    this.awaitingAck = false;
    if (this.lastBeatSentAt !== null) {
      this.lastLatencyMs = Date.now() - this.lastBeatSentAt;
    }
  }

  /** Round-trip time of the most recent beat/ack pair, or null before the first ack. */
  get latencyMs(): number | null {
    return this.lastLatencyMs;
  }

  private beat(): void {
    // The previous beat was never acknowledged, so the connection is dead.
    if (this.awaitingAck) {
      this.options.onZombie();
      return;
    }

    this.sendBeat();
  }

  private sendBeat(): void {
    this.awaitingAck = true;
    this.lastBeatSentAt = Date.now();
    this.options.sendHeartbeat();
  }
}

/**
 * Callbacks and timing for a HeartbeatMonitor. `intervalMs` comes from
 * HELLO; `sendHeartbeat` sends the actual frame; `onZombie` fires when a
 * beat went unacknowledged for a full interval.
 */
export interface HeartbeatMonitorOptions {
  intervalMs: number;
  sendHeartbeat: () => void;
  onZombie: () => void;
}
