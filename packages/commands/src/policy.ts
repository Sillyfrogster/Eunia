import type { AnyCommand, CommandGroup } from "./command";
import type {
  CooldownResult,
  CooldownStore,
} from "./cooldown";
import { CommandRejection, CooldownStoreError } from "./errors";
import { ownerIds } from "./manager-runtime";
import { hasPermissions, resolvePermissionBits } from "./permissions";
import type {
  CommandAccess,
  CommandAccessContext,
  CommandContext,
  CommandGuard,
  CommandHost,
  CommandPermissionNeeds,
  CommandRateLimit,
  ListenerContext,
} from "./types";

interface AccessCheck {
  readonly context: CommandAccessContext;
  readonly host: CommandHost;
  readonly guards: readonly CommandGuard[];
  readonly nodes?: readonly (AnyCommand | CommandGroup)[];
  readonly additionalAccess?: CommandAccess;
}

export async function checkCommandAccess(input: AccessCheck): Promise<void> {
  const nodes = input.nodes ?? [
    ...input.context.groups,
    input.context.command,
  ];
  const accessRules = [
    ...nodes.map((node) => node.access),
    input.additionalAccess,
  ].filter((access): access is CommandAccess => access !== undefined);

  for (const access of accessRules) {
    checkBuiltInAccess(input.context, input.host, access);
  }

  for (const guard of [
    ...input.guards,
    ...accessRules.flatMap((access) => access.guards ?? []),
  ]) {
    const result = await guard(input.context);
    if (result === false) {
      throw new CommandRejection("guard", "This command was blocked.");
    }
    if (typeof result === "object" && result.allowed === false) {
      throw new CommandRejection(
        "guard",
        result.reason ?? "This command was blocked.",
        result.details ?? {},
      );
    }
  }
}

export function commandPermissionNeeds(
  nodes: readonly (AnyCommand | CommandGroup)[],
  additionalAccess?: CommandAccess,
  globalGuards: readonly CommandGuard[] = [],
): CommandPermissionNeeds {
  const accessRules = [
    ...nodes.map((node) => node.access),
    additionalAccess,
  ];
  const guardsNeedPermissions =
    globalGuards.length > 0 ||
    accessRules.some((access) => (access?.guards?.length ?? 0) > 0);
  return {
    user:
      guardsNeedPermissions ||
      accessRules.some(
        (access) => access?.userPermissions !== undefined,
      ),
    bot:
      guardsNeedPermissions ||
      accessRules.some(
        (access) => access?.botPermissions !== undefined,
      ),
  };
}

export async function consumeCommandCooldown(
  context: CommandContext,
  store: CooldownStore,
  host: CommandHost,
): Promise<void> {
  const rateLimit = context.command.rateLimit;
  if (rateLimit === undefined) return;
  await consumeRateLimit(context, rateLimit, store, host, "command");
}

export async function consumeListenerCooldown(
  context: ListenerContext,
  rateLimit: CommandRateLimit | undefined,
  store: CooldownStore,
  host: CommandHost,
): Promise<void> {
  if (rateLimit === undefined) return;
  await consumeRateLimit(context, rateLimit, store, host, "listener");
}

async function consumeRateLimit(
  context: CommandContext | ListenerContext,
  rateLimit: CommandRateLimit,
  store: CooldownStore,
  host: CommandHost,
  category: "command" | "listener",
): Promise<void> {
  const scope = rateLimit.scope ?? "user";
  const identity = cooldownIdentity(scope, context);
  const route = encodeURIComponent(
    JSON.stringify([context.command.type, ...context.path]),
  );
  const now = Date.now();
  let result;
  try {
    const namespace = host.applicationId || host.botId || "unbound";
    result = validateCooldownResult(
      await store.consume({
        key: `eunia:${category}:${namespace}:${route}:${scope}:${identity}`,
        limit: rateLimit.limit,
        windowMs: rateLimit.windowMs,
        now,
      }),
      rateLimit.limit,
    );
  } catch (error) {
    throw new CooldownStoreError(error);
  }
  if (!result.allowed) {
    throw new CommandRejection("cooldown", "This command is on cooldown.", {
      scope,
      retryAfterMs: Math.max(0, result.resetAt - Date.now()),
      resetAt: result.resetAt,
      ...(result.saturated === undefined
        ? {}
        : { saturated: result.saturated }),
    });
  }
}

function checkBuiltInAccess(
  context: CommandAccessContext,
  host: CommandHost,
  access: CommandAccess,
): void {
  if (access.guildOnly && context.guildId === undefined) {
    throw new CommandRejection(
      "guild_only",
      "This command requires a guild.",
    );
  }
  if (access.ownerOnly && !ownerIds(host).has(context.userId)) {
    throw new CommandRejection(
      "owner_only",
      "This command requires a bot owner.",
    );
  }
  if (access.userPermissions !== undefined) {
    const required = resolvePermissionBits(access.userPermissions);
    if (context.userPermissions === undefined) {
      throw new CommandRejection(
        "permission_data_unavailable",
        "User permission data is unavailable.",
        { subject: "user", required },
      );
    }
    if (!hasPermissions(context.userPermissions, required)) {
      throw new CommandRejection(
        "missing_user_permissions",
        "User permissions are missing.",
        {
          required,
          missing: required & ~context.userPermissions,
        },
      );
    }
  }
  if (access.botPermissions !== undefined) {
    const required = resolvePermissionBits(access.botPermissions);
    if (context.botPermissions === undefined) {
      throw new CommandRejection(
        "permission_data_unavailable",
        "Bot permission data is unavailable.",
        { subject: "bot", required },
      );
    }
    if (!hasPermissions(context.botPermissions, required)) {
      throw new CommandRejection(
        "missing_bot_permissions",
        "Bot permissions are missing.",
        {
          required,
          missing: required & ~context.botPermissions,
        },
      );
    }
  }
}

function cooldownIdentity(
  scope: string,
  context: {
    readonly userId: string;
    readonly channelId?: string;
    readonly guildId?: string;
  },
): string {
  switch (scope) {
    case "global":
      return "global";
    case "guild":
      return context.guildId ?? `dm:${context.channelId ?? context.userId}`;
    case "channel":
      return context.channelId ?? `user:${context.userId}`;
    default:
      return context.userId;
  }
}

function validateCooldownResult(
  result: CooldownResult,
  limit: number,
): CooldownResult {
  if (result === null || typeof result !== "object") {
    throw new TypeError("Cooldown stores must return a result object.");
  }
  if (typeof result.allowed !== "boolean") {
    throw new TypeError("Cooldown results need a boolean allowed value.");
  }
  if (
    !Number.isSafeInteger(result.remaining) ||
    result.remaining < 0 ||
    result.remaining > limit
  ) {
    throw new TypeError(
      "Cooldown results have an invalid remaining count.",
    );
  }
  if (!Number.isFinite(result.resetAt) || result.resetAt < 0) {
    throw new TypeError("Cooldown results need a valid reset time.");
  }
  if (
    result.saturated !== undefined &&
    typeof result.saturated !== "boolean"
  ) {
    throw new TypeError(
      "Cooldown results need a boolean saturated value.",
    );
  }
  if (!result.allowed && result.remaining !== 0) {
    throw new TypeError(
      "Rejected cooldown results cannot have remaining uses.",
    );
  }
  if (result.allowed && result.saturated === true) {
    throw new TypeError(
      "Saturated cooldown results cannot allow a use.",
    );
  }
  return result;
}
