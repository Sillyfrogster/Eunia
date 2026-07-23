import type { CacheOptions } from "@eunia/cache";
import type {
  CommandManagerOptions,
  CommandNode,
  CommandPublishTarget,
} from "@eunia/commands";
import type { GatewayPresence, ShardPlan } from "@eunia/gateway";
import type { RestOptions } from "@eunia/rest";
import type { Logger } from "@eunia/shared";
import type { StructureCache } from "@eunia/structures";
import type { EuniaModule } from "./modules";

export type IntentInput = number | readonly number[];

export interface ClientGatewayOptions {
  readonly shards?: ShardPlan;
  readonly presence?: GatewayPresence;
  readonly largeThreshold?: number;
}

export interface ClientCommandOptions extends CommandManagerOptions {
  readonly commands?: readonly CommandNode[];
  readonly publishOnStart?: false | CommandPublishTarget;
  readonly autoHandle?: boolean;
}

export interface ClientOptions {
  readonly token: string;
  readonly intents: IntentInput;
  readonly applicationId?: string;
  readonly botId?: string;
  readonly ownerIds?: readonly string[];
  readonly rest?: Omit<RestOptions, "token">;
  readonly gateway?: ClientGatewayOptions;
  readonly cache?: CacheOptions | StructureCache;
  readonly commands?: ClientCommandOptions;
  readonly modules?: readonly EuniaModule[];
  readonly logger?: Logger;
}

export function resolveIntents(intents: IntentInput): number {
  const values = typeof intents === "number" ? [intents] : intents;
  if (!Array.isArray(values)) {
    throw new TypeError("intents must be a bitfield or an array of intent values.");
  }

  let bitfield = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("Every intent value must be a non-negative safe integer.");
    }
    bitfield |= value;
  }
  return bitfield;
}
