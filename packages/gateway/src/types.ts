import type { GatewayOpcode } from "./constants";

export enum ActivityType {
  Playing = 0,
  Streaming = 1,
  Listening = 2,
  Watching = 3,
  Custom = 4,
  Competing = 5,
}

export interface GatewayActivity {
  name: string;
  type: ActivityType;
  url?: string | null;
  state?: string | null;
}

export interface GatewayPresence {
  since: number | null;
  activities: GatewayActivity[];
  status: "online" | "dnd" | "idle" | "invisible" | "offline";
  afk: boolean;
}

/**
 * The envelope for every gateway frame, in both directions.
 *
 * `op` is the opcode, `d` the data (its shape depends on the opcode),
 * `s` the sequence number, and `t` the event name. `s` and `t` are only
 * non-null on Dispatch (op 0) frames.
 */
export interface GatewayPayload<D = unknown> {
  op: GatewayOpcode;
  d: D;
  s: number | null;
  t: string | null;
}

/**
 * Data of the HELLO frame, the first thing Discord sends after connecting.
 * `heartbeat_interval` is in milliseconds.
 */
export interface HelloData {
  heartbeat_interval: number;
}

/**
 * Data of the IDENTIFY frame, the login payload that starts a new session.
 * The token is sent bare here; only REST prefixes it with "Bot ".
 * `shard` is [shardId, shardCount] and may be omitted for a single connection.
 */
export interface IdentifyData {
  token: string;
  intents: number;
  properties: {
    os: string;
    browser: string;
    device: string;
  };
  shard?: [shardId: number, shardCount: number];
  presence?: GatewayPresence;
  large_threshold?: number;
}

export interface RequestGuildMembersData {
  guild_id: string;
  query?: string;
  limit?: number;
  presences?: boolean;
  user_ids?: string | string[];
  nonce?: string;
}

/**
 * Data of the RESUME frame. Reattaches to an existing session after a
 * disconnect. `seq` is the last sequence number that was processed.
 */
export interface ResumeData {
  token: string;
  session_id: string;
  seq: number;
}

/**
 * Data of the READY event, the first dispatch of a new session.
 *
 * `session_id` and `resume_gateway_url` are what make resuming possible and
 * must be kept: resumes go to that url specifically, not the general
 * gateway url. Guilds arrive as stubs and fill in through GUILD_CREATE.
 */
export interface ReadyData {
  v: number;
  user: {
    id: string;
    username: string;
    discriminator: string;
  };
  session_id: string;
  resume_gateway_url: string;
  guilds: { id: string; unavailable?: boolean }[];
  shard?: [number, number];
  application?: { id: string; flags: number };
}

/**
 * Response of GET /gateway/bot, fetched before connecting.
 *
 * `session_start_limit` is the identify budget: how many new sessions the
 * bot may start before the window resets (`reset_after` is in ms).
 */
export interface GatewayBotInfo {
  url: string;
  shards: number;
  session_start_limit: {
    total: number;
    remaining: number;
    reset_after: number;
    max_concurrency: number;
  };
}
