import { EventEmitter } from "node:events";
import type { Logger } from "@eunia/shared";
import { IdentifyGate } from "./identify-gate";
import {
  Shard,
  ShardState,
  type CloseInfo,
  type ReconnectInfo,
  type ShardOptions,
} from "./shard";
import type {
  GatewayBotInfo,
  GatewayPresence,
  ReadyData,
  RequestGuildMembersData,
} from "./types";

export type ShardPlan =
  | "auto"
  | number
  | { total: number; ids?: readonly number[] };

export interface ShardManagerOptions {
  gateway: GatewayBotInfo;
  token: string;
  intents: number;
  shards?: ShardPlan;
  presence?: GatewayPresence;
  largeThreshold?: number;
  logger?: Logger;
}

export interface ShardManager {
  on(event: "ready", listener: (sessions: readonly ReadyData[]) => void): this;
  on(
    event: "dispatch",
    listener: (shardId: number, eventName: string, data: unknown) => void,
  ): this;
  on(event: "resumed", listener: (shardId: number) => void): this;
  on(
    event: "reconnecting",
    listener: (shardId: number, info: ReconnectInfo) => void,
  ): this;
  on(event: "closed", listener: (shardId: number, info: CloseInfo) => void): this;
  emit(event: "ready", sessions: readonly ReadyData[]): boolean;
  emit(event: "dispatch", shardId: number, eventName: string, data: unknown): boolean;
  emit(event: "resumed", shardId: number): boolean;
  emit(event: "reconnecting", shardId: number, info: ReconnectInfo): boolean;
  emit(event: "closed", shardId: number, info: CloseInfo): boolean;
}

/** Owns a bot's shard set and identify concurrency. */
export class ShardManager extends EventEmitter {
  private readonly shardsById = new Map<number, Shard>();
  private readonly readyById = new Map<number, ReadyData>();
  private started = false;
  readonly totalShards: number;
  readonly shardIds: readonly number[];

  constructor(private readonly options: ShardManagerOptions) {
    super();
    const plan = resolveShardPlan(options.shards ?? "auto", options.gateway.shards);
    this.totalShards = plan.total;
    this.shardIds = plan.ids;
    if (plan.ids.length > options.gateway.session_start_limit.remaining) {
      throw new Error(
        `Starting ${plan.ids.length} shards exceeds the remaining identify budget of ${options.gateway.session_start_limit.remaining}.`,
      );
    }
  }

  /** Connects every assigned shard and resolves when all are ready. */
  async connect(): Promise<void> {
    if (this.started) throw new Error("ShardManager.connect() can only be called once.");
    this.started = true;
    const gate = new IdentifyGate(this.options.gateway.session_start_limit.max_concurrency);

    for (const shardId of this.shardIds) {
      const shardOptions: ShardOptions = {
        url: this.options.gateway.url,
        token: this.options.token,
        intents: this.options.intents,
        shard: [shardId, this.totalShards],
        identifyGate: gate,
        ...(this.options.logger
          ? { logger: this.options.logger.child(`shard-${shardId}`) }
          : {}),
        ...(this.options.presence ? { presence: this.options.presence } : {}),
        ...(this.options.largeThreshold === undefined
          ? {}
          : { largeThreshold: this.options.largeThreshold }),
      };
      const shard = new Shard(shardOptions);
      this.shardsById.set(shardId, shard);
      shard.on("ready", (data) => this.readyById.set(shardId, data));
      shard.on("dispatch", (name, data) => this.emit("dispatch", shardId, name, data));
      shard.on("resumed", () => this.emit("resumed", shardId));
      shard.on("reconnecting", (info) => this.emit("reconnecting", shardId, info));
      shard.on("closed", (info) => this.emit("closed", shardId, info));
    }

    try {
      await Promise.all([...this.shardsById.values()].map((shard) => shard.connect()));
    } catch (error) {
      this.destroy("shard startup failed");
      throw error;
    }
    const sessions = this.shardIds
      .map((id) => this.readyById.get(id))
      .filter((data): data is ReadyData => data !== undefined);
    this.emit("ready", sessions);
  }

  /** Permanently closes every shard. */
  destroy(reason = "manager destroyed"): void {
    for (const shard of this.shardsById.values()) shard.disconnect(1000, reason);
  }

  /** Sends one member request to the shard that owns its guild. */
  requestGuildMembers(request: RequestGuildMembersData): Promise<void> {
    return this.shardForGuild(request.guild_id).requestGuildMembers(request);
  }

  /** Applies a presence to every assigned shard. */
  async updatePresence(presence: GatewayPresence): Promise<void> {
    await Promise.all(
      [...this.shardsById.values()]
        .filter((shard) => shard.state === ShardState.Ready)
        .map((shard) => shard.updatePresence(presence)),
    );
  }

  /** Returns the current heartbeat latency for each shard. */
  get latencies(): ReadonlyMap<number, number | null> {
    return new Map(
      [...this.shardsById].map(([id, shard]) => [id, shard.latencyMs] as const),
    );
  }

  get averageLatencyMs(): number | null {
    const values = [...this.shardsById.values()]
      .map((shard) => shard.latencyMs)
      .filter((latency): latency is number => latency !== null);
    return values.length === 0
      ? null
      : Math.round(values.reduce((total, latency) => total + latency, 0) / values.length);
  }

  private shardForGuild(guildId: string): Shard {
    const shardId = shardIdForGuild(guildId, this.totalShards);
    const shard = this.shardsById.get(shardId);
    if (!shard) throw new Error(`Shard ${shardId} is not assigned to this process.`);
    return shard;
  }
}

/** Calculates the shard that owns a guild. */
export function shardIdForGuild(guildId: string, shardCount: number): number {
  if (!/^\d+$/.test(guildId)) throw new TypeError("guildId must be a snowflake.");
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new RangeError("shardCount must be a positive integer.");
  }
  return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}

function resolveShardPlan(
  plan: ShardPlan,
  recommended: number,
): { total: number; ids: readonly number[] } {
  const total = plan === "auto" ? recommended : typeof plan === "number" ? plan : plan.total;
  if (!Number.isInteger(total) || total < 1) {
    throw new RangeError("The total shard count must be a positive integer.");
  }
  const requested = typeof plan === "object" ? plan.ids : undefined;
  const ids = requested ? [...requested] : Array.from({ length: total }, (_, id) => id);
  if (new Set(ids).size !== ids.length) throw new Error("Shard ids must be unique.");
  if (ids.some((id) => !Number.isInteger(id) || id < 0 || id >= total)) {
    throw new RangeError("Every shard id must be within the configured shard count.");
  }
  return { total, ids };
}
