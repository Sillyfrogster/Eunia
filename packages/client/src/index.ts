export { Client } from "./client";
export type {
  ClientEventMap,
  ClientState,
  GuildBanInfo,
  GuildDeleteInfo,
  GuildMemberRemoveInfo,
  MessageDeleteBulkInfo,
  MessageDeleteInfo,
  RoleDeleteInfo,
  ThreadDeleteInfo,
} from "./events/client-events";
export { orderModules, type EuniaModule } from "./modules";
export {
  resolveIntents,
  type ClientCommandOptions,
  type ClientGatewayOptions,
  type ClientOptions,
  type IntentInput,
} from "./options";
export { ServiceRegistry, type ServiceKey } from "./services";
export type {
  ListMessagesOptions,
} from "./domains/messages";
export type {
  ChannelPin,
  ChannelPinPage,
  ListPinsOptions,
} from "./domains/pins";

export {
  Command,
  CommandError,
  CommandExecutionError,
  CommandGroup,
  CommandManager,
  CommandRejection,
  CommandValidationError,
  DuplicateCommandError,
  MemoryCooldownStore,
  RegistrationFrozenError,
  onButton,
  onModal,
  onSelect,
  option,
  tokenizePrefix,
  type AutoDeferOptions,
  type AutocompleteContext,
  type CommandChoice,
  type CommandContext,
  type CommandGuard,
  type CommandHandleResult,
  type CommandKind,
  type CommandManagerOptions,
  type CommandMiddleware,
  type CommandNode,
  type CommandNodeClass,
  type CommandPublishResult,
  type CommandPublishTarget,
  type CommandRateLimit,
  type CooldownStore,
  type ListenerContext,
  type OptionAccess,
  type PrefixCommandContext,
  type PrefixOptions,
  type PrefixResolver,
  type SlashCommandContext,
} from "@eunia/commands";
export {
  Cache,
  MemoryStore,
  RedisCacheAdapter,
  ValkeyCacheAdapter,
  type CacheAdapter,
  type BuiltInCacheAdapterConfig,
  type CacheOptions,
  type CachePolicy,
} from "@eunia/cache";
export {
  ActivityType,
  Intents,
  type GatewayPresence,
  type RequestChannelInfoData,
  type RequestGuildMembersData,
  type RequestSoundboardSoundsData,
  type ShardPlan,
  type UpdateVoiceStateData,
} from "@eunia/gateway";
export {
  DiscordError,
  EuniaRest,
  RateLimitExhaustedError,
  type RestFile,
  type RestDiagnostics,
  type RestOptions,
} from "@eunia/rest";
export {
  ConsoleLogger,
  SilentLogger,
  type Logger,
  type LoggerOptions,
  type LogLevel,
} from "@eunia/shared";
export * from "@eunia/structures";
