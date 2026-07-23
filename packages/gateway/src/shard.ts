/**
 * One gateway connection and its full life cycle.
 *
 *   Idle ─connect()─▶ Connecting ─▶ WaitingForHello
 *                                        │ HELLO
 *                     ┌──────────────────┴─────────┐
 *                     ▼ (new session)              ▼ (existing session)
 *                 Identifying ─ READY ─▶ Ready ◀─ RESUMED ─ Resuming
 *                                          │
 *                      close / zombie / op 7 / op 9
 *                                          ▼
 *                                    Reconnecting ─▶ back to Connecting
 *                                          │
 *                                          ▼ (fatal code or disconnect())
 *                                    Disconnected (final)
 */

import { EventEmitter } from "node:events";
import { createLogger, type Logger } from "@eunia/shared";
import { GatewayConnection } from "./connection";
import {
  FATAL_CLOSE_CODES,
  GatewayCloseCode,
  Intents,
  GatewayOpcode,
  IDENTIFY_COOLDOWN_MS,
} from "./constants";
import { HeartbeatMonitor } from "./heartbeat";
import type { IdentifyGate } from "./identify-gate";
import { FORCE_CLOSE_GRACE_MS, HELLO_TIMEOUT_MS, ZOMBIE_CLOSE_CODE } from "./policy";
import { planReconnect } from "./reconnect";
import { GatewaySendLimiter } from "./send-limiter";
import type {
  GatewayPayload,
  GatewayPresence,
  HelloData,
  IdentifyData,
  ReadyData,
  RequestChannelInfoData,
  RequestGuildMembersData,
  RequestSoundboardSoundsData,
  ResumeData,
  UpdateVoiceStateData,
} from "./types";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The connection states a Shard moves through. See the diagram in this file's header. */
export enum ShardState {
  Idle = "idle",
  Connecting = "connecting",
  WaitingForHello = "waiting-for-hello",
  Identifying = "identifying",
  Resuming = "resuming",
  Ready = "ready",
  Reconnecting = "reconnecting",
  Disconnected = "disconnected",
}

/**
 * Options for a Shard. `url` comes from GET /gateway/bot; `intents` is the
 * combined bitfield; `shard` is [shardId, shardCount] and defaults to a
 * single connection.
 */
export interface ShardOptions {
  url: string;
  token: string;
  intents: number;
  shard?: [number, number];
  presence?: GatewayPresence;
  largeThreshold?: number;
  identifyGate?: IdentifyGate;
  logger?: Logger;
}

/** Details of a scheduled reconnect. `resume` tells whether the session will be resumed or re-identified. */
export interface ReconnectInfo {
  attempt: number;
  delayMs: number;
  resume: boolean;
  reason: string;
}

/** Why a shard (or client) ended for good. `fatal` means a close code retrying can't fix. */
export interface CloseInfo {
  code: number;
  reason: string;
  fatal: boolean;
}

/**
 * Events a Shard emits. "closed" fires only when the shard is done for
 * good; ordinary drops surface as "reconnecting" followed by "resumed" or
 * "ready". Every dispatch, including READY and RESUMED, also flows through
 * the generic "dispatch" event.
 */
export interface Shard {
  on(event: "ready", listener: (data: ReadyData) => void): this;
  on(event: "resumed", listener: () => void): this;
  on(event: "dispatch", listener: (eventName: string, data: unknown) => void): this;
  on(event: "reconnecting", listener: (info: ReconnectInfo) => void): this;
  on(event: "closed", listener: (info: CloseInfo) => void): this;
  emit(event: "ready", data: ReadyData): boolean;
  emit(event: "resumed"): boolean;
  emit(event: "dispatch", eventName: string, data: unknown): boolean;
  emit(event: "reconnecting", info: ReconnectInfo): boolean;
  emit(event: "closed", info: CloseInfo): boolean;
}

/**
 * One gateway connection. Connects, identifies, heartbeats, and keeps
 * itself alive: ordinary drops are recovered internally with a session
 * resume (or a fresh identify when the session is gone), with exponential
 * backoff. Only a fatal close code or `disconnect()` ends it permanently.
 */
export class Shard extends EventEmitter {
  private readonly log: Logger;
  private readonly token: string;

  /**
   * The live transport, replaced wholesale on every reconnect. Doubles as
   * the staleness guard: async work captures the connection it belongs to
   * and bails when `this.connection` no longer matches.
   */
  private connection: GatewayConnection | null = null;
  private heartbeat: HeartbeatMonitor | null = null;
  private sendLimiter = new GatewaySendLimiter();

  /** Which handshake the next HELLO should trigger. */
  private handshake: "identify" | "resume" = "identify";

  private currentState: ShardState = ShardState.Idle;

  /** Session state. Survives reconnects and is required for resuming. */
  private sequence: number | null = null;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private forceCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private lastIdentifyAt = 0;

  /** Non-heartbeat sends chain here so budget delays can't reorder them. */
  private sendChain: Promise<void> = Promise.resolve();

  /** Settles the promise returned by connect() on first READY or fatal close. */
  private pendingConnect: { resolve: () => void; reject: (error: Error) => void } | null = null;

  constructor(private readonly options: ShardOptions) {
    super();
    this.log = options.logger ?? createLogger("gateway");
    this.token = options.token.trim();
    if (this.token.length === 0) throw new TypeError("Shard requires a bot token.");
    if (/\s/.test(this.token)) throw new TypeError("The bot token contains whitespace.");
    if (!Number.isInteger(options.intents) || options.intents < 0) {
      throw new RangeError("intents must be a non-negative integer.");
    }
    if (options.shard !== undefined) {
      const [id, total] = options.shard;
      if (!Number.isInteger(total) || total < 1) {
        throw new RangeError("The shard count must be a positive integer.");
      }
      if (!Number.isInteger(id) || id < 0 || id >= total) {
        throw new RangeError("The shard id must be within the shard count.");
      }
    }
    if (
      options.largeThreshold !== undefined &&
      (!Number.isInteger(options.largeThreshold) ||
        options.largeThreshold < 50 ||
        options.largeThreshold > 250)
    ) {
      throw new RangeError("largeThreshold must be an integer from 50 through 250.");
    }
  }

  /** The current connection state. */
  get state(): ShardState {
    return this.currentState;
  }

  /** Heartbeat round-trip time in ms, or null before the first ack. */
  get latencyMs(): number | null {
    return this.heartbeat?.latencyMs ?? null;
  }

  /** Updates this shard's presence. */
  updatePresence(presence: GatewayPresence): Promise<void> {
    this.assertReady("update presence");
    return this.enqueueSend({ op: GatewayOpcode.PresenceUpdate, d: presence });
  }

  /** Requests members for one guild on this shard. */
  requestGuildMembers(request: RequestGuildMembersData): Promise<void> {
    this.assertReady("request guild members");
    if (!/^\d+$/.test(request.guild_id)) {
      throw new TypeError("Member requests require a guild snowflake.");
    }
    const hasQuery = request.query !== undefined;
    const hasUsers = request.user_ids !== undefined;
    if (hasQuery === hasUsers) {
      throw new TypeError("Member requests require either query or user_ids.");
    }
    if (hasQuery && request.limit === undefined) {
      throw new TypeError("Member requests with query require limit.");
    }
    if (
      request.limit !== undefined &&
      (!Number.isInteger(request.limit) || request.limit < 0 || request.limit > 100)
    ) {
      throw new RangeError("Member request limits must be integers from 0 through 100.");
    }
    const userIds = Array.isArray(request.user_ids)
      ? request.user_ids
      : request.user_ids === undefined
        ? []
        : [request.user_ids];
    if (hasUsers && userIds.length === 0) {
      throw new RangeError("Member requests need at least one user id.");
    }
    if (userIds.length > 100) throw new RangeError("Member requests accept up to 100 user ids.");
    if (userIds.some((userId) => !/^\d+$/.test(userId))) {
      throw new TypeError("Member request user ids must be snowflakes.");
    }
    if (
      request.presences === true &&
      (this.options.intents & Intents.GuildPresences) === 0
    ) {
      throw new Error("Member requests with presences need the GuildPresences intent.");
    }
    if (request.nonce !== undefined && Buffer.byteLength(request.nonce) > 32) {
      throw new RangeError("Member request nonces cannot exceed 32 bytes.");
    }
    return this.enqueueSend({ op: GatewayOpcode.RequestGuildMembers, d: request });
  }

  /** Requests soundboard sounds for guilds assigned to this shard. */
  requestSoundboardSounds(request: RequestSoundboardSoundsData): Promise<void> {
    this.assertReady("request soundboard sounds");
    if (request.guild_ids.length === 0) {
      throw new RangeError("Soundboard requests need at least one guild id.");
    }
    if (request.guild_ids.some((guildId) => !/^\d+$/.test(guildId))) {
      throw new TypeError("Soundboard request guild ids must be snowflakes.");
    }
    return this.enqueueSend({
      op: GatewayOpcode.RequestSoundboardSounds,
      d: request,
    });
  }

  /** Requests ephemeral channel data for one guild. */
  requestChannelInfo(request: RequestChannelInfoData): Promise<void> {
    this.assertReady("request channel info");
    if (!/^\d+$/.test(request.guild_id)) {
      throw new TypeError("Channel info requests require a guild snowflake.");
    }
    if (request.fields.length === 0) {
      throw new RangeError("Channel info requests need at least one field.");
    }
    if (
      request.fields.some(
        (field) => field !== "status" && field !== "voice_start_time",
      )
    ) {
      throw new TypeError("Channel info requests contain an unknown field.");
    }
    return this.enqueueSend({ op: GatewayOpcode.RequestChannelInfo, d: request });
  }

  /** Joins, moves, updates, or disconnects this shard's voice connection. */
  updateVoiceState(state: UpdateVoiceStateData): Promise<void> {
    this.assertReady("update voice state");
    if (!/^\d+$/.test(state.guild_id)) {
      throw new TypeError("Voice state updates require a guild snowflake.");
    }
    if (state.channel_id !== null && !/^\d+$/.test(state.channel_id)) {
      throw new TypeError("Voice state channel ids must be snowflakes or null.");
    }
    return this.enqueueSend({ op: GatewayOpcode.VoiceStateUpdate, d: state });
  }

  /**
   * Connects and logs in. Resolves once the shard is READY; rejects on a
   * fatal close (bad token, disallowed intents). After it resolves, the
   * shard handles drops and reconnects on its own.
   */
  connect(): Promise<void> {
    if (this.currentState !== ShardState.Idle && this.currentState !== ShardState.Disconnected) {
      throw new Error(`Cannot connect while shard is "${this.currentState}"`);
    }
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    return new Promise<void>((resolve, reject) => {
      this.pendingConnect = { resolve, reject };
      this.startConnection("identify");
    });
  }

  /**
   * Closes the connection permanently and disables auto-reconnect.
   * The default close code 1000 tells Discord to discard the session.
   */
  disconnect(code = 1000, reason = "requested by user"): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connection !== null) {
      this.log.info(`disconnecting (code ${code}: ${reason})`);
      this.closeConnection(code, reason);
    } else if (this.currentState !== ShardState.Disconnected) {
      // Mid-backoff, so there is no connection to close.
      this.settleClose(code, reason);
    }
  }

  private startConnection(mode: "identify" | "resume"): void {
    this.handshake = mode;

    // Resumes must use the url READY provided. The general url has no session.
    const base =
      mode === "resume" && this.resumeGatewayUrl !== null ? this.resumeGatewayUrl : this.options.url;

    this.setState(ShardState.Connecting);
    this.log.info(`connecting (${mode})`);

    this.sendLimiter = new GatewaySendLimiter();
    this.sendChain = Promise.resolve();
    const conn: GatewayConnection = new GatewayConnection(base, {
      onOpen: () => {
        if (conn !== this.connection) return;
        // Nothing may be sent until HELLO arrives.
        this.setState(ShardState.WaitingForHello);
      },
      onPayload: (payload) => {
        if (conn !== this.connection) return;
        this.handlePayload(payload);
      },
      onClose: (code, reason) => {
        this.finalizeClose(conn, code, reason);
      },
      onStreamError: (error) => {
        if (conn !== this.connection) return;
        // A corrupted stream cannot recover, so reconnect for a fresh inflater.
        this.log.error("zlib stream corrupted:", error.message);
        this.recycle("zlib stream corrupted");
      },
    }, this.log);
    this.connection = conn;

    this.helloTimer = setTimeout(() => {
      if (conn !== this.connection) return;
      this.recycle("no HELLO from gateway");
    }, HELLO_TIMEOUT_MS);
  }

  private handlePayload(payload: GatewayPayload): void {
    // Heartbeats and resumes need this current, so track it before anything else.
    if (payload.s !== null) this.sequence = payload.s;

    switch (payload.op) {
      case GatewayOpcode.Hello:
        this.handleHello(payload.d as HelloData);
        break;

      case GatewayOpcode.HeartbeatAck:
        this.heartbeat?.ack();
        break;

      case GatewayOpcode.Heartbeat:
        this.heartbeat?.beatNow();
        break;

      case GatewayOpcode.Dispatch:
        this.handleDispatch(payload);
        break;

      case GatewayOpcode.Reconnect:
        this.log.info("server requested reconnect — resuming");
        this.recycle("server requested reconnect");
        break;

      case GatewayOpcode.InvalidSession: {
        const resumable = payload.d === true;
        this.log.warn(`invalid session (resumable: ${resumable})`);
        if (!resumable) {
          this.sessionId = null;
          this.resumeGatewayUrl = null;
        }
        this.recycle("invalid session");
        break;
      }

      default:
        break;
    }
  }

  /** Handles HELLO: starts the heartbeat loop, then identifies or resumes. */
  private handleHello(data: HelloData): void {
    if (this.helloTimer !== null) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
    }

    this.heartbeat = new HeartbeatMonitor({
      intervalMs: data.heartbeat_interval,
      sendHeartbeat: () => {
        void this.enqueueSend(
          { op: GatewayOpcode.Heartbeat, d: this.sequence },
          { heartbeat: true },
        );
      },
      onZombie: () => {
        // The socket looks open but the connection is dead.
        this.log.warn("no heartbeat ack for a full interval, reconnecting");
        this.recycle("zombie connection (no heartbeat ack)");
      },
    });
    this.heartbeat.start();

    if (this.handshake === "resume") {
      this.resume();
    } else {
      this.identify().catch((error: unknown) => this.log.error("identify failed:", error));
    }
  }

  /** Sends IDENTIFY, starting a new session. */
  private async identify(): Promise<void> {
    this.setState(ShardState.Identifying);
    const conn = this.connection;

    if (this.options.identifyGate) {
      await this.options.identifyGate.acquire(this.options.shard?.[0] ?? 0);
      if (conn !== this.connection) return;
    } else {
      const cooldown = IDENTIFY_COOLDOWN_MS - (Date.now() - this.lastIdentifyAt);
      if (cooldown > 0) {
        await sleep(cooldown);
        if (conn !== this.connection) return;
      }
    }
    this.lastIdentifyAt = Date.now();

    // A new session must not inherit the old session's state.
    this.sequence = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;

    const identify: IdentifyData = {
      token: this.token,
      intents: this.options.intents,
      properties: {
        os: process.platform,
        browser: "eunia",
        device: "eunia",
      },
      ...(this.options.shard ? { shard: this.options.shard } : {}),
      ...(this.options.presence ? { presence: this.options.presence } : {}),
      ...(this.options.largeThreshold
        ? { large_threshold: this.options.largeThreshold }
        : {}),
    };

    this.log.info("identifying");
    await this.enqueueSend({ op: GatewayOpcode.Identify, d: identify });
  }

  /**
   * Sends RESUME.
   *
   * Discord replays every event after `seq` in order and then sends RESUMED,
   * so no events are lost and no identify is spent.
   */
  private resume(): void {
    if (this.sessionId === null || this.sequence === null) {
      this.log.warn("resume requested without session state, identifying instead");
      this.identify().catch((error: unknown) => this.log.error("identify failed:", error));
      return;
    }

    this.setState(ShardState.Resuming);
    const resumeData: ResumeData = {
      token: this.token,
      session_id: this.sessionId,
      seq: this.sequence,
    };
    this.log.info("resuming session");
    void this.enqueueSend({ op: GatewayOpcode.Resume, d: resumeData });
  }

  /**
   * Handles a dispatch.
   *
   * READY and RESUMED are treated specially because they carry session state.
   * Every dispatch is then emitted through the generic "dispatch" event.
   */
  private handleDispatch(payload: GatewayPayload): void {
    const eventName = payload.t ?? "UNKNOWN";

    if (eventName === "READY") {
      const ready = payload.d as ReadyData;
      this.sessionId = ready.session_id;
      this.resumeGatewayUrl = ready.resume_gateway_url;
      this.reconnectAttempts = 0;

      this.setState(ShardState.Ready);
      this.log.info(`ready as ${ready.user.username} (${ready.guilds.length} guild(s))`);
      this.pendingConnect?.resolve();
      this.pendingConnect = null;
      this.emit("ready", ready);
    } else if (eventName === "RESUMED") {
      // Arrives after the replay, so every missed event was already dispatched.
      this.reconnectAttempts = 0;
      this.setState(ShardState.Ready);
      this.log.info("resumed, missed events replayed");
      this.pendingConnect?.resolve();
      this.pendingConnect = null;
      this.emit("resumed");
    }

    this.emit("dispatch", eventName, payload.d);
  }

  /**
   * Sends one payload, respecting the outbound limit.
   *
   * Heartbeats use reserved slots and skip the queue, because a delayed
   * heartbeat makes the connection look dead. Everything else goes through a
   * FIFO chain so a budget delay cannot reorder payloads.
   */
  private enqueueSend(
    payload: Omit<GatewayPayload, "s" | "t">,
    opts: { heartbeat?: boolean } = {},
  ): Promise<void> {
    const conn = this.connection;
    if (conn === null) {
      return Promise.reject(new Error(`Cannot send gateway opcode ${payload.op} without a connection.`));
    }

    if (opts.heartbeat) {
      const sending = this.writeWhenAllowed(conn, payload, true);
      void sending.catch((error: unknown) => {
        this.log.error("heartbeat send failed:", error);
        if (conn === this.connection) this.recycle("heartbeat send failed");
      });
      return sending;
    }
    const sending = this.sendChain.then(() => this.writeWhenAllowed(conn, payload, false));
    this.sendChain = sending.catch((error: unknown) => {
      this.log.error("gateway send failed:", error);
    });
    return sending;
  }

  /** Waits out the send budget if needed, then writes unless the connection was replaced. */
  private async writeWhenAllowed(
    conn: GatewayConnection,
    payload: Omit<GatewayPayload, "s" | "t">,
    isHeartbeat: boolean,
  ): Promise<void> {
    if (conn !== this.connection || !conn.isOpen) {
      this.log.warn(`dropped op ${payload.op} — socket not open`);
      return;
    }

    for (;;) {
      const waitMs = this.sendLimiter.allowanceMs(isHeartbeat);
      if (waitMs <= 0) break;
      this.log.warn(`send budget exhausted — delaying op ${payload.op} by ${waitMs}ms`);
      await sleep(waitMs);
      if (conn !== this.connection || !conn.isOpen) {
        this.log.warn(`dropped op ${payload.op} — connection replaced while waiting`);
        return;
      }
    }

    this.sendLimiter.recordSend();
    conn.send(payload);
  }

  /**
   * Kills the current connection so the reconnect machinery replaces it.
   * For recoverable teardowns only; disconnect() is the permanent version.
   */
  private recycle(reason: string): void {
    this.closeConnection(ZOMBIE_CLOSE_CODE, reason);
  }

  /**
   * Asks the connection to close, with a deadline: if the close handshake
   * never completes, the close is declared locally after the grace period
   * (1006 = closed abnormally).
   */
  private closeConnection(code: number, reason: string): void {
    const conn = this.connection;
    if (conn === null) return;

    conn.close(code, reason);
    this.forceCloseTimer = setTimeout(() => {
      this.finalizeClose(conn, 1006, `${reason} (force-closed)`);
    }, FORCE_CLOSE_GRACE_MS);
  }

  /**
   * The single teardown path for a live connection. Every ending funnels
   * through here exactly once; the identity guard makes duplicate calls
   * (the socket's close event racing the force timer) no-ops.
   */
  private finalizeClose(conn: GatewayConnection, code: number, reason: string): void {
    if (conn !== this.connection) return;
    this.connection = null;

    if (this.helloTimer !== null) clearTimeout(this.helloTimer);
    if (this.forceCloseTimer !== null) clearTimeout(this.forceCloseTimer);
    this.helloTimer = null;
    this.forceCloseTimer = null;
    this.heartbeat?.stop();
    this.heartbeat = null;
    conn.destroy();

    this.settleClose(code, reason);
  }

  /** Decides what a close means: stop for good, or schedule a comeback. */
  private settleClose(code: number, reason: string): void {
    const fatal = FATAL_CLOSE_CODES.has(code);
    const codeName = GatewayCloseCode[code] ?? "non-Discord code";
    this.log[fatal ? "error" : "warn"](
      `closed: ${code} (${codeName}) ${reason || "(no reason given)"}${fatal ? " — fatal, will not retry" : ""}`,
    );

    if (fatal || this.intentionalClose) {
      this.setState(ShardState.Disconnected);
      this.pendingConnect?.reject(new Error(`gateway closed: ${code} (${codeName}) ${reason}`.trim()));
      this.pendingConnect = null;
      this.emit("closed", { code, reason, fatal });
      return;
    }

    this.scheduleReconnect(code, reason);
  }

  /** Plans resume-vs-identify and the backoff, then waits it out. */
  private scheduleReconnect(code: number, reason: string): void {
    this.reconnectAttempts++;
    const basePlan = planReconnect(
      code,
      this.reconnectAttempts,
      this.sessionId !== null && this.sequence !== null,
    );
    const plan =
      reason === "invalid session"
        ? { ...basePlan, delayMs: 1_000 + Math.floor(Math.random() * 4_001) }
        : basePlan;
    if (!plan.resume) {
      this.sessionId = null;
      this.resumeGatewayUrl = null;
    }

    this.setState(ShardState.Reconnecting);
    this.log.warn(
      `reconnecting in ${plan.delayMs}ms (attempt ${this.reconnectAttempts}, ` +
        `${plan.resume ? "resume" : "re-identify"})`,
    );
    this.emit("reconnecting", {
      attempt: this.reconnectAttempts,
      delayMs: plan.delayMs,
      resume: plan.resume,
      reason,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startConnection(plan.resume ? "resume" : "identify");
    }, plan.delayMs);
  }

  private setState(next: ShardState): void {
    this.currentState = next;
  }

  private assertReady(action: string): void {
    if (this.currentState !== ShardState.Ready) {
      throw new Error(`Cannot ${action} while shard is ${this.currentState}.`);
    }
  }
}
