import { EventEmitter } from "node:events";
import { Cache, type CacheOptions } from "@eunia/cache";
import {
  CommandManager,
  type CommandHandleResult,
  type CommandPublishTarget,
} from "@eunia/commands";
import {
  Intents,
  ShardManager,
  type GatewayBotInfo,
  type GatewayPresence,
  type RequestChannelInfoData,
  type RequestGuildMembersData,
  type RequestSoundboardSoundsData,
  type UpdateVoiceStateData,
} from "@eunia/gateway";
import { EuniaRest, routePath } from "@eunia/rest";
import { createLogger, type Logger } from "@eunia/shared";
import {
  Channel,
  Guild,
  GuildMember,
  Message,
  Role,
  User,
  isInteraction,
  type Interaction,
  type StructureCache,
  type StructureCacheShape,
  type StructureContext,
} from "@eunia/structures";
import type * as types from "@eunia/types";
import { ChannelsDomain } from "./domains/channels";
import { GuildsDomain } from "./domains/guilds";
import { MembersDomain } from "./domains/members";
import { MessagesDomain } from "./domains/messages";
import { PinsDomain } from "./domains/pins";
import { ReactionsDomain } from "./domains/reactions";
import { RolesDomain } from "./domains/roles";
import { UsersDomain } from "./domains/users";
import { routeDispatch } from "./events";
import type { ClientEventMap, ClientState } from "./events/client-events";
import { orderModules, type EuniaModule } from "./modules";
import {
  resolveIntents,
  type ClientGatewayOptions,
  type ClientOptions,
} from "./options";
import { ServiceRegistry } from "./services";

/** Connects Eunia's transport, cache, structures, commands, and modules. */
export class Client extends EventEmitter<ClientEventMap> {
  declare embeds: import("../../helpers/src").EmbedRegistry;
  declare components: import("../../helpers/src").ComponentRegistry;
  declare modals: import("../../helpers/src").ModalRegistry;
  readonly rest: EuniaRest;
  readonly cache: StructureCache;
  readonly context: StructureContext;
  readonly commands: CommandManager;
  readonly services = new ServiceRegistry();

  readonly users: UsersDomain;
  readonly guilds: GuildsDomain;
  readonly channels: ChannelsDomain;
  readonly messages: MessagesDomain;
  readonly members: MembersDomain;
  readonly roles: RolesDomain;
  readonly reactions: ReactionsDomain;
  readonly pins: PinsDomain;

  private readonly log: Logger;
  private readonly token: string;
  private readonly intents: number;
  private readonly gatewayOptions: ClientGatewayOptions;
  private readonly publishOnStart: false | CommandPublishTarget | undefined;
  private readonly configuredModules: EuniaModule[];
  private readonly activeModules: EuniaModule[] = [];
  private readonly readyByShard = new Map<number, types.ReadyEvent>();
  private gatewayManager?: ShardManager;
  private currentState: ClientState = "idle";
  private startPromise?: Promise<this>;
  private stopPromise?: Promise<void>;
  private stopRequested = false;
  private startupError: unknown;
  private applicationIdValue: string | undefined;
  private botIdValue: string | undefined;

  constructor(options: ClientOptions) {
    super();
    this.log = options.logger ?? createLogger("eunia");
    this.token = options.token.trim();
    if (this.token.length === 0) throw new TypeError("Client requires a bot token.");
    if (/\s/.test(this.token)) throw new TypeError("The bot token contains whitespace.");
    this.intents = resolveIntents(options.intents);
    this.applicationIdValue = normalizeOptionalId(options.applicationId, "applicationId");
    this.botIdValue = normalizeOptionalId(options.botId, "botId");
    this.gatewayOptions = structuredClone(options.gateway ?? {});
    this.publishOnStart = structuredClone(options.commands?.publishOnStart);

    this.rest = new EuniaRest({
      ...options.rest,
      token: this.token,
      logger: options.rest?.logger ?? this.log.child("rest"),
    });
    this.cache = isStructureCache(options.cache)
      ? options.cache
      : new Cache<StructureCacheShape>(withCacheErrors(options.cache, this.log));
    this.context = { rest: this.rest, cache: this.cache };

    this.users = new UsersDomain(this.context);
    this.guilds = new GuildsDomain(this.context);
    this.channels = new ChannelsDomain(this.context);
    this.messages = new MessagesDomain(this.context);
    this.members = new MembersDomain(this.context);
    this.roles = new RolesDomain(this.context);
    this.reactions = new ReactionsDomain(this.context);
    this.pins = new PinsDomain(this.context);

    const client = this;
    this.commands = new CommandManager(
      {
        get applicationId() {
          return client.applicationId ?? "";
        },
        get botId() {
          return client.botId ?? "";
        },
        ownerIds: Object.freeze([...(options.ownerIds ?? [])]),
        rest: this.rest,
        reportCommandError(error, context) {
          client.log.error(error.message, error.cause);
          if (context === undefined) client.emit("commandError", error);
          else client.emit("commandError", error, context);
        },
      },
      options.commands,
    );
    if (options.commands?.commands) this.commands.register(...options.commands.commands);
    if (
      options.commands?.prefix !== undefined &&
      (this.intents & Intents.MessageContent) === 0
    ) {
      throw new Error("Prefix commands need the MessageContent gateway intent.");
    }

    this.configuredModules = [...(options.modules ?? [])];
    orderModules(this.configuredModules);
  }

  get state(): ClientState {
    return this.currentState;
  }

  get isReady(): boolean {
    return this.currentState === "ready";
  }

  get applicationId(): string | undefined {
    return this.applicationIdValue;
  }

  get botId(): string | undefined {
    return this.botIdValue;
  }

  get self(): User | undefined {
    return this.botIdValue === undefined ? undefined : this.users.peek(this.botIdValue);
  }

  get latencyMs(): number | null {
    return this.gatewayManager?.averageLatencyMs ?? null;
  }

  get latencies(): ReadonlyMap<number, number | null> {
    return this.gatewayManager?.latencies ?? new Map();
  }

  get shardIds(): readonly number[] {
    return this.gatewayManager?.shardIds ?? [];
  }

  get totalShards(): number {
    return this.gatewayManager?.totalShards ?? 0;
  }

  get readySessions(): ReadonlyMap<number, Readonly<types.ReadyEvent>> {
    return new Map(this.readyByShard);
  }

  use(module: EuniaModule): this {
    if (this.currentState !== "idle") {
      throw new Error("Modules must be registered before the client starts.");
    }
    orderModules([...this.configuredModules, module]);
    this.configuredModules.push(module);
    return this;
  }

  start(): Promise<this> {
    if (this.currentState === "ready") return Promise.resolve(this);
    if (this.startPromise !== undefined) return this.startPromise;
    if (this.currentState !== "idle") {
      return Promise.reject(new Error(`Cannot start a client while it is ${this.currentState}.`));
    }

    this.setState("starting");
    this.startPromise = this.startInternal();
    return this.startPromise;
  }

  stop(): Promise<void> {
    if (this.stopPromise !== undefined) return this.stopPromise;
    this.stopRequested = true;
    this.stopPromise = this.stopInternal();
    return this.stopPromise;
  }

  destroy(): Promise<void> {
    return this.stop();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }

  updatePresence(presence: GatewayPresence): Promise<void> {
    return this.requireGateway().updatePresence(presence);
  }

  requestGuildMembers(request: RequestGuildMembersData): Promise<void> {
    return this.requireGateway().requestGuildMembers(request);
  }

  requestSoundboardSounds(request: RequestSoundboardSoundsData): Promise<void> {
    return this.requireGateway().requestSoundboardSounds(request);
  }

  requestChannelInfo(request: RequestChannelInfoData): Promise<void> {
    return this.requireGateway().requestChannelInfo(request);
  }

  updateVoiceState(state: UpdateVoiceStateData): Promise<void> {
    return this.requireGateway().updateVoiceState(state);
  }

  /** @internal Updates identity from one shard's READY event. */
  recordReady(ready: types.ReadyEvent, shardId: number): void {
    this.readyByShard.set(shardId, ready);
    if (this.botIdValue !== undefined && this.botIdValue !== ready.user.id) {
      const error = new Error("The configured botId does not match the gateway user.");
      this.startupError ??= error;
      throw error;
    }
    this.botIdValue = ready.user.id;

    const application = ready.application;
    const receivedApplicationId =
      typeof application === "object" &&
      application !== null &&
      "id" in application &&
      typeof application.id === "string"
        ? application.id
        : undefined;
    if (
      receivedApplicationId !== undefined &&
      this.applicationIdValue !== undefined &&
      this.applicationIdValue !== receivedApplicationId
    ) {
      const error = new Error(
        "The configured applicationId does not match the gateway application.",
      );
      this.startupError ??= error;
      throw error;
    }
    if (receivedApplicationId !== undefined) this.applicationIdValue = receivedApplicationId;
  }

  /** @internal Sends a structure through the command framework. */
  async handleCommand(source: Interaction | Message): Promise<CommandHandleResult> {
    try {
      const result = await this.commands.handle(
        source,
        isInteraction(source)
          ? {}
          : { resolvePermissions: () => this.commandPermissions(source) },
      );
      if (result.status !== "ignored") this.emit("commandResult", result, source);
      return result;
    } catch (error) {
      this.reportClientError(error, "command dispatch");
      throw error;
    }
  }

  private async startInternal(): Promise<this> {
    try {
      const modules = orderModules(this.configuredModules);
      for (const module of modules) {
        this.activeModules.push(module);
        await module.setup?.(this);
        this.throwIfStopRequested();
      }

      const gateway = await this.rest.get<GatewayBotInfo>(routePath("/gateway/bot"));
      this.throwIfStopRequested();
      this.gatewayManager = new ShardManager({
        gateway,
        token: this.token,
        intents: this.intents,
        shards: this.gatewayOptions.shards ?? "auto",
        ...(this.gatewayOptions.presence === undefined
          ? {}
          : { presence: this.gatewayOptions.presence }),
        ...(this.gatewayOptions.largeThreshold === undefined
          ? {}
          : { largeThreshold: this.gatewayOptions.largeThreshold }),
        logger: this.log.child("gateway"),
      });
      this.wireGateway(this.gatewayManager);
      await this.gatewayManager.connect();
      this.throwIfStopRequested();
      if (this.startupError !== undefined) throw this.startupError;

      const self = this.self;
      if (self === undefined) throw new Error("The gateway became ready without a bot user.");

      if (this.publishOnStart) {
        await this.commands.publish(this.publishOnStart);
      }
      for (const module of this.activeModules) {
        await module.start?.(this);
        this.throwIfStopRequested();
      }

      this.setState("ready");
      this.emitSafely("ready", self);
      return this;
    } catch (error) {
      this.gatewayManager?.destroy("client startup failed");
      await this.stopModules();
      try {
        await this.cache.close();
      } catch (closeError) {
        this.reportClientError(closeError, "cache rollback");
      }
      this.services.clear();
      this.setState(this.stopRequested ? "stopped" : "failed");
      if (this.stopRequested) this.emitSafely("stopped");
      throw error;
    }
  }

  private async stopInternal(): Promise<void> {
    if (this.currentState === "stopped") return;
    if (this.currentState === "starting" && this.startPromise !== undefined) {
      this.gatewayManager?.destroy("client stopped during startup");
      await this.startPromise.catch(() => undefined);
    }
    const stateAfterStart = this.currentState as ClientState;
    if (stateAfterStart === "failed" || stateAfterStart === "stopped") return;

    this.setState("stopping");
    const errors: unknown[] = [];
    this.gatewayManager?.destroy("client stopped");
    errors.push(...(await this.stopModules()));
    try {
      await this.cache.close();
    } catch (error) {
      errors.push(error);
    }
    this.services.clear();
    this.setState("stopped");
    this.emitSafely("stopped");
    if (errors.length > 0) throw new AggregateError(errors, "The client stopped with cleanup errors.");
  }

  private async stopModules(): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const module of [...this.activeModules].reverse()) {
      try {
        await module.stop?.(this);
      } catch (error) {
        errors.push(error);
        this.reportClientError(error, `module ${module.name} cleanup`);
      }
    }
    this.activeModules.length = 0;
    return errors;
  }

  private wireGateway(gateway: ShardManager): void {
    gateway.on("dispatch", (shardId, eventName, data) => {
      try {
        const handled = routeDispatch(this, this.context, eventName, data, shardId);
        if (handled !== undefined) {
          void handled.catch((error) => {
            this.reportClientError(error, `gateway event ${eventName}`);
          });
        }
      } catch (error) {
        this.reportClientError(error, `gateway event ${eventName}`);
      }
      try {
        this.emit("dispatch", eventName, data, shardId);
      } catch (error) {
        this.reportClientError(error, `dispatch listener ${eventName}`);
      }
    });
    gateway.on("reconnecting", (shardId, info) => {
      this.emitSafely("shardReconnecting", shardId, info);
    });
    gateway.on("resumed", (shardId) => {
      this.emitSafely("shardResumed", shardId);
    });
    gateway.on("closed", (shardId, info) => {
      this.emitSafely("shardClosed", shardId, info);
    });
  }

  private async commandPermissions(source: Interaction | Message): Promise<{
    userPermissions?: bigint;
    botPermissions?: bigint;
  }> {
    if (isInteraction(source) || source.guildId === undefined) return {};

    const guildId = source.guildId;
    const [guild, channel] = await Promise.all([
      source.guild === undefined
        ? this.loadPermissionResource("guild", () => this.guilds.get(guildId))
        : source.guild,
      source.channel === undefined
        ? this.loadPermissionResource("channel", () => this.channels.get(source.channelId))
        : source.channel,
    ]);
    if (guild === undefined || channel === undefined) return {};

    const permissionChannel = channel.isThread
      ? await this.loadPermissionResource("parent channel", async () => {
          const parentId = channel.raw.parent_id;
          if (parentId === undefined || parentId === null) {
            throw new Error("Thread permissions need a parent channel.");
          }
          return this.channels.get(parentId);
        })
      : channel;
    if (permissionChannel === undefined) return {};

    const userMember = source.raw.member === undefined
      ? undefined
      : new GuildMember(
          source.raw.member,
          this.context,
          guildId,
          source.author.id,
        );
    const userPermissions = userMember === undefined
      ? undefined
      : permissionChannel.permissionsFor(userMember);

    const botId = this.botIdValue;
    const cachedBot = botId === undefined ? undefined : this.members.peek(guildId, botId);
    const botMember =
      cachedBot ??
      (botId === undefined
        ? undefined
        : await this.loadPermissionResource("bot member", () =>
            this.members.get(guildId, botId),
          ));
    const botPermissions = botMember === undefined
      ? undefined
      : permissionChannel.permissionsFor(botMember);
    return {
      ...(userPermissions === undefined ? {} : { userPermissions }),
      ...(botPermissions === undefined ? {} : { botPermissions }),
    };
  }

  private async loadPermissionResource<T>(
    name: string,
    load: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await load();
    } catch (error) {
      this.reportClientError(error, `command permission ${name}`);
      return undefined;
    }
  }

  private requireGateway(): ShardManager {
    if (this.gatewayManager === undefined) throw new Error("The client has not started.");
    return this.gatewayManager;
  }

  private throwIfStopRequested(): void {
    if (this.stopRequested) throw new Error("Client startup was stopped.");
  }

  private setState(state: ClientState): void {
    const previous = this.currentState;
    if (state === previous) return;
    this.currentState = state;
    this.emitSafely("stateChange", state, previous);
  }

  private emitSafely<EventName extends keyof ClientEventMap>(
    event: EventName,
    ...args: ClientEventMap[EventName]
  ): boolean {
    try {
      return EventEmitter.prototype.emit.call(this, event, ...args);
    } catch (error) {
      this.reportClientError(error, `${event} listener`);
      return false;
    }
  }

  private reportClientError(error: unknown, source: string): void {
    this.log.error(`${source}:`, error);
    if (this.listenerCount("clientError") === 0) return;
    try {
      this.emit("clientError", error, source);
    } catch (listenerError) {
      this.log.error("clientError listener failed:", listenerError);
    }
  }
}

function isStructureCache(value: ClientOptions["cache"]): value is StructureCache {
  return value instanceof Cache;
}

function withCacheErrors(options: CacheOptions | undefined, logger: Logger): CacheOptions {
  if (options?.onError !== undefined) return options;
  return {
    ...options,
    onError(error, context) {
      logger.error(`cache ${context.operation} failed in ${context.namespace}:`, error);
    },
  };
}

function normalizeOptionalId(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new TypeError(`${name} must be a snowflake.`);
  return value;
}
