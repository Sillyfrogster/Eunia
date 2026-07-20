import {
  ApplicationCommandType,
  MessageFlags,
  ApplicationCommandOptionType,
} from "@eunia/types";
import type * as types from "@eunia/types";
import { isInteraction, normalizeSendable, type Interaction, type Message, type Sendable } from "@eunia/structures";
import { Command, type CommandNode } from "./command";
import {
  MemoryCooldownStore,
  type CooldownResult,
  type CooldownStore,
} from "./cooldown";
import {
  AutocompleteError,
  CommandError,
  CommandExecutionError,
  CommandOptionError,
  CommandRejection,
  CommandValidationError,
  CooldownStoreError,
  DuplicateCommandError,
  MiddlewareError,
  RegistrationFrozenError,
} from "./errors";
import type { OptionField } from "./fields";
import { parseListenerCustomId, type ListenerField } from "./listeners";
import { ResolvedOptions } from "./options";
import { prepareNode, type PreparedCommand, type PreparedGroup, type PreparedNode } from "./prepare";
import { matchPrefix, normalizePrefixOptions, tokenizePrefix } from "./prefix";
import type {
  AutocompleteContext,
  CommandChoice,
  CommandContext,
  CommandGuard,
  CommandHandleOptions,
  CommandHandleResult,
  CommandHost,
  CommandManagerOptions,
  CommandMessageFactory,
  CommandMessages,
  CommandMiddleware,
  CommandPublishResult,
  CommandPublishTarget,
  ListenerContext,
  OptionAccess,
  PrefixCommandContext,
  PrefixOptions,
  SlashCommandContext,
} from "./types";
import {
  hasPermissions,
  resolvePermissionBits,
  serializeCommand,
  validateCommandTree,
} from "./validation";

interface ResolvedCommand {
  readonly command: PreparedCommand;
  readonly groups: readonly PreparedGroup[];
  readonly options: readonly types.ApplicationCommandInteractionOption[];
}

interface ResolvedPrefixCommand {
  readonly command: PreparedCommand;
  readonly groups: readonly PreparedGroup[];
  readonly arguments: readonly string[];
}

interface ListenerRoute {
  readonly prepared: PreparedCommand;
  readonly fieldName: string;
  readonly field: ListenerField;
}

interface AutoDeferHandle {
  timer?: ReturnType<typeof setTimeout>;
  completion?: Promise<void>;
}

const DEFAULT_MESSAGES: Required<CommandMessages> = {
  guildOnly: "This command can only be used in a server.",
  ownerOnly: "This command is only available to the bot owners.",
  userPermissions: "You do not have permission to use this command.",
  botPermissions: "I do not have permission to run this command.",
  permissionDataUnavailable: "Permission data is not available for this command.",
  cooldown: (rejection) => {
    const retryAfterMs = Number(rejection.details.retryAfterMs ?? 0);
    return `Try this command again in ${Math.max(1, Math.ceil(retryAfterMs / 1_000))} seconds.`;
  },
  guard: (rejection) => rejection.message,
  invalidInput: (rejection) => rejection.message,
  unavailable: "This command is not available.",
  error: "The command could not be completed.",
};

export class CommandManager {
  private readonly roots: PreparedNode[] = [];
  private readonly slashRoots = new Map<string, PreparedNode>();
  private readonly prefixRoots = new Map<string, PreparedNode>();
  private readonly listenerRoutes = new Map<string, ListenerRoute>();
  private readonly host: CommandHost;
  private readonly middleware: readonly CommandMiddleware[];
  private readonly guards: readonly CommandGuard[];
  private readonly cooldowns: CooldownStore;
  private readonly autocompleteTimeoutMs: number;
  private readonly messages: Required<CommandMessages>;
  private readonly prefix?: Required<PrefixOptions>;
  private frozen = false;

  constructor(host: CommandHost, options: CommandManagerOptions = {}) {
    this.host = host;
    this.middleware = Object.freeze([...(options.middleware ?? [])]);
    this.guards = Object.freeze([...(options.guards ?? [])]);
    this.cooldowns = options.cooldownStore ?? new MemoryCooldownStore();
    this.autocompleteTimeoutMs = options.autocompleteTimeoutMs ?? 2_500;
    this.messages = Object.freeze({ ...DEFAULT_MESSAGES, ...options.messages });
    if (options.prefix !== undefined) this.prefix = normalizePrefixOptions(options.prefix);

    if (typeof this.host.rest?.put !== "function") throw new TypeError("CommandHost needs REST put access.");
    if (typeof this.host.reportCommandError !== "function") {
      throw new TypeError("CommandHost needs a command error reporter.");
    }
    if (this.middleware.some((entry) => typeof entry !== "function")) {
      throw new TypeError("Global command middleware must be functions.");
    }
    if (this.guards.some((entry) => typeof entry !== "function")) {
      throw new TypeError("Global command guards must be functions.");
    }
    if (
      !Number.isFinite(this.autocompleteTimeoutMs) ||
      this.autocompleteTimeoutMs < 0 ||
      this.autocompleteTimeoutMs > 2_500
    ) {
      throw new RangeError("Autocomplete timeouts must be between 0 and 2500 milliseconds.");
    }
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  get commands(): readonly CommandNode[] {
    return Object.freeze(
      this.roots.map((node) => (node.nodeKind === "command" ? node.command : node.group)),
    );
  }

  register(...commands: readonly CommandNode[]): this {
    if (this.frozen) throw new RegistrationFrozenError();

    const prepared = commands.map((command) => prepareNode(command));
    const slashNames = new Map(this.slashRoots);
    const prefixNames = new Map(this.prefixRoots);
    const listenerRoutes = new Map(this.listenerRoutes);
    if (slashNames.size + prepared.length > 100) {
      throw new CommandValidationError("Discord allows at most 100 chat input commands per scope.");
    }
    for (const node of prepared) {
      validateCommandTree(node);
      if (node.commandKind !== "prefix") {
        if (slashNames.has(node.definition.name)) {
          throw new DuplicateCommandError(node.definition.name);
        }
        slashNames.set(node.definition.name, node);
      }
      if (node.commandKind !== "slash") {
        const aliases = node.nodeKind === "command" ? node.command.aliases : node.group.aliases;
        for (const candidate of [node.definition.name, ...aliases]) {
          const key = candidate.toLowerCase();
          if (prefixNames.has(key)) throw new DuplicateCommandError(candidate);
          prefixNames.set(key, node);
        }
      }
      collectListenerRoutes(node, listenerRoutes);
    }

    this.slashRoots.clear();
    this.prefixRoots.clear();
    this.listenerRoutes.clear();
    for (const [name, node] of slashNames) this.slashRoots.set(name, node);
    for (const [name, node] of prefixNames) this.prefixRoots.set(name, node);
    for (const [route, entry] of listenerRoutes) this.listenerRoutes.set(route, entry);
    this.roots.push(...prepared);
    return this;
  }

  async handle(
    source: Interaction | Message,
    options: CommandHandleOptions = {},
  ): Promise<CommandHandleResult> {
    return isInteraction(source)
      ? this.handleInteraction(source, options)
      : this.handleMessage(source, options);
  }

  async publish<T = unknown>(
    target: CommandPublishTarget = {},
  ): Promise<CommandPublishResult<T>> {
    const applicationId = this.host.applicationId;
    if (applicationId.length === 0) {
      throw new TypeError("Command publishing needs an applicationId.");
    }
    if (target.scope === "guild" && target.guildId.length === 0) {
      throw new TypeError("Guild command publishing needs a guildId.");
    }
    this.freeze();
    const body = this.roots
      .filter((node) => node.commandKind !== "prefix")
      .map((node) => serializeCommand(node, target.scope === "guild" ? "guild" : "global"));

    if (target.scope === "guild") {
      const commands = await this.host.rest.put<T>(
        `/applications/${applicationId}/guilds/${target.guildId}/commands`,
        body,
      );
      return { target: "guild", guildId: target.guildId, commands };
    }

    const commands = await this.host.rest.put<T>(
      `/applications/${applicationId}/commands`,
      body,
    );
    return { target: "global", commands };
  }

  private freeze(): void {
    if (this.frozen) return;
    this.frozen = true;
    Object.freeze(this.roots);
  }

  private async handleInteraction(
    interaction: Interaction,
    handleOptions: CommandHandleOptions,
  ): Promise<CommandHandleResult> {
    if (
      interaction.kind === "button" ||
      interaction.kind === "select" ||
      interaction.kind === "modal"
    ) {
      return this.handleListener(interaction);
    }

    const data = interaction.raw.data as types.ApplicationCommandInteractionData | undefined;
    if (
      data === undefined ||
      typeof data.name !== "string" ||
      data.type !== ApplicationCommandType.ChatInput
    ) {
      return { status: "ignored" };
    }
    const root = this.slashRoots.get(data.name);
    if (root === undefined) return { status: "ignored" };
    this.freeze();

    let resolved: ResolvedCommand;
    try {
      resolved = resolveSlashCommand(root, data.options ?? []);
    } catch (error) {
      if (error instanceof CommandRejection) {
        if (interaction.kind === "autocomplete") {
          await this.emptyAutocomplete(interaction);
        } else {
          await this.respondWithoutContext(interaction, error);
        }
        return { status: "rejected", rejection: error };
      }
      return this.fail(new CommandExecutionError([data.name], error));
    }

    if (interaction.kind === "autocomplete") {
      return this.handleAutocomplete(interaction, data, resolved, handleOptions);
    }
    return this.executeSlash(interaction, data, resolved, handleOptions);
  }

  private async handleListener(
    interaction: Interaction<"button" | "select" | "modal">,
  ): Promise<CommandHandleResult> {
    const parsed = parseListenerCustomId(interaction.customId);
    if (parsed === null) return { status: "ignored" };
    const route = this.listenerRoutes.get(parsed.route);
    if (route === undefined || route.field.kind !== interaction.kind) {
      return { status: "ignored" };
    }

    const path = Object.freeze([route.prepared.definition.name, route.fieldName]);
    const userId = interaction.raw.member?.user?.id ?? interaction.raw.user?.id;
    if (userId === undefined) return { status: "ignored" };

    const context: ListenerContext = Object.freeze({
      kind: interaction.kind,
      command: route.prepared.command,
      host: this.host,
      interaction,
      args: parsed.args,
      userId,
      ...(interaction.channelId === undefined ? {} : { channelId: interaction.channelId }),
      ...(interaction.guildId === undefined ? {} : { guildId: interaction.guildId }),
      reply: (input: Sendable) =>
        interaction.state === "pending"
          ? interaction.respond(input)
          : interaction.followup(input),
      update: (input: Sendable) => interaction.update(input),
      defer: async () => {
        if (interaction.state !== "pending") return false;
        await interaction.defer();
        return true;
      },
    });

    try {
      await (route.field.handler as (
        context: ListenerContext,
        args: readonly string[],
      ) => unknown)(context, parsed.args);
      return { status: "completed", path };
    } catch (error) {
      if (error instanceof CommandRejection) {
        await this.respondWithoutContext(interaction, error);
        return { status: "rejected", rejection: error };
      }
      const wrapped = new CommandExecutionError(path, error);
      await this.report(wrapped);
      return { status: "failed", error: wrapped };
    }
  }

  private async executeSlash(
    interaction: Interaction<"command">,
    data: types.ApplicationCommandInteractionData,
    resolved: ResolvedCommand,
    handleOptions: CommandHandleOptions,
  ): Promise<CommandHandleResult> {
    const path = commandPath(resolved);
    const responder = new InteractionResponder(interaction);

    let context: SlashCommandContext;
    try {
      const options = ResolvedOptions.fromInteraction(
        resolved.command.options,
        resolved.options,
        data.resolved,
        "execute",
        interaction,
      );
      const userId = interaction.raw.member?.user?.id ?? interaction.raw.user?.id;
      if (userId === undefined) {
        throw new CommandRejection("command_unavailable", "The command user is missing.");
      }
      const permissionData = interactionPermissions(
        interaction,
        await resolvedPermissions(handleOptions),
      );
      context = Object.freeze({
        kind: "slash" as const,
        command: resolved.command.command,
        groups: Object.freeze(resolved.groups.map((group) => group.group)),
        path,
        host: this.host,
        ...optionAccess(resolved.command, options),
        userId,
        ...(interaction.channelId === undefined ? {} : { channelId: interaction.channelId }),
        ...(interaction.guildId === undefined ? {} : { guildId: interaction.guildId }),
        ...(permissionData.user === undefined ? {} : { userPermissions: permissionData.user }),
        ...(permissionData.bot === undefined ? {} : { botPermissions: permissionData.bot }),
        interaction,
        reply: (response: Sendable) => responder.reply(response),
        defer: (options?: { readonly ephemeral?: boolean }) => responder.defer(options),
      });
    } catch (error) {
      if (error instanceof CommandRejection) {
        await this.respondWithResponder(responder, error);
        return { status: "rejected", rejection: error };
      }
      return this.fail(new CommandExecutionError(path, error));
    }

    return this.executeContext(context, responder);
  }

  private async handleAutocomplete(
    interaction: Interaction<"autocomplete">,
    data: types.ApplicationCommandInteractionData,
    resolved: ResolvedCommand,
    handleOptions: CommandHandleOptions,
  ): Promise<CommandHandleResult> {
    const path = commandPath(resolved);
    let errorContext: AutocompleteContext | undefined;
    const responder = new AutocompleteResponder(
      interaction,
      this.autocompleteTimeoutMs,
      async (error) => {
        await this.report(new AutocompleteError(path, error), errorContext);
      },
    );

    const work = (async (): Promise<CommandHandleResult> => {
      try {
        const options = ResolvedOptions.fromInteraction(
          resolved.command.options,
          resolved.options,
          data.resolved,
          "autocomplete",
          interaction,
        );
        if (options.focused === undefined) {
          throw new CommandRejection("invalid_input", "Autocomplete has no focused option.");
        }
        const definition = resolved.command.options.find(
          (option) => option.name === options.focused?.name,
        );
        if (
          definition === undefined ||
          !("autocomplete" in definition) ||
          definition.autocomplete !== true
        ) {
          throw new CommandRejection(
            "invalid_input",
            "The focused option does not support autocomplete.",
          );
        }
        const userId = interaction.raw.member?.user?.id ?? interaction.raw.user?.id;
        if (userId === undefined) {
          throw new CommandRejection("command_unavailable", "The command user is missing.");
        }
        const permissionData = interactionPermissions(
          interaction,
          await resolvedPermissions(handleOptions),
        );
        const autocompleteContext: AutocompleteContext = Object.freeze({
          kind: "autocomplete" as const,
          command: resolved.command.command,
          groups: Object.freeze(resolved.groups.map((group) => group.group)),
          path,
          host: this.host,
          interaction,
          ...optionAccess(resolved.command, options),
          focused: options.focused,
          userId,
          ...(interaction.channelId === undefined
            ? {}
            : { channelId: interaction.channelId }),
          ...(interaction.guildId === undefined
            ? {}
            : { guildId: interaction.guildId }),
          ...(permissionData.user === undefined
            ? {}
            : { userPermissions: permissionData.user }),
          ...(permissionData.bot === undefined
            ? {}
            : { botPermissions: permissionData.bot }),
        });
        errorContext = autocompleteContext;
        await this.runChecks(autocompleteContext);
        const choices = await resolved.command.command.autocomplete(autocompleteContext);
        const serialized = validateAutocompleteChoices(choices, options.focused.type);
        await responder.send(serialized);
        return { status: "autocomplete", path };
      } catch (error) {
        await responder.sendEmpty();
        if (error instanceof CommandRejection) {
          return { status: "rejected", rejection: error };
        }
        const wrapped = new AutocompleteError(path, error);
        await this.report(wrapped, errorContext);
        return { status: "failed", error: wrapped };
      }
    })();

    const outcome = await Promise.race([
      work.then((result) => ({ kind: "work" as const, result })),
      responder.deadline.then(() => ({ kind: "timeout" as const })),
    ]);
    if (outcome.kind === "timeout") {
      void work.then(
        async () => responder.close(),
        async (error: unknown) => {
          await this.report(new AutocompleteError(path, error), errorContext);
          await responder.close();
        },
      );
      return { status: "autocomplete", path };
    }
    try {
      return outcome.result;
    } finally {
      await responder.close();
    }
  }

  private async handleMessage(
    message: Message,
    handleOptions: CommandHandleOptions,
  ): Promise<CommandHandleResult> {
    if (this.prefix === undefined) return { status: "ignored" };

    let match;
    try {
      match = await matchPrefix(message, this.host, this.prefix);
    } catch (error) {
      const wrapped = new CommandExecutionError(["prefix"], error);
      await this.report(wrapped);
      return { status: "failed", error: wrapped };
    }
    if (match === null) return { status: "ignored" };

    let tokens: readonly string[];
    try {
      tokens = tokenizePrefix(match.content);
    } catch (error) {
      if (error instanceof CommandRejection) {
        await this.respondWithoutContext(message, error);
        return { status: "rejected", rejection: error };
      }
      const wrapped = new CommandExecutionError(["prefix"], error);
      await this.report(wrapped);
      return { status: "failed", error: wrapped };
    }
    const rootToken = tokens[0];
    if (rootToken === undefined) return { status: "ignored" };
    const root = this.prefixRoots.get(rootToken.toLowerCase());
    if (root === undefined || !nameMatches(root, rootToken, match.caseSensitive)) {
      return { status: "ignored" };
    }
    this.freeze();

    let resolved: ResolvedPrefixCommand;
    try {
      resolved = resolvePrefixCommand(root, tokens.slice(1), match.caseSensitive);
    } catch (error) {
      if (error instanceof CommandRejection) {
        await this.respondWithoutContext(message, error);
        return { status: "rejected", rejection: error };
      }
      const wrapped = new CommandExecutionError([root.definition.name], error);
      await this.report(wrapped);
      return { status: "failed", error: wrapped };
    }

    const path = commandPath(resolved);
    let context: PrefixCommandContext;
    try {
      const options = ResolvedOptions.fromPrefix(
        resolved.command.options,
        resolved.arguments,
        message.raw,
      );
      const permissionData = messagePermissions(
        message,
        await resolvedPermissions(handleOptions),
      );
      context = Object.freeze({
        kind: "prefix" as const,
        command: resolved.command.command,
        groups: Object.freeze(resolved.groups.map((group) => group.group)),
        path,
        host: this.host,
        ...optionAccess(resolved.command, options),
        userId: message.raw.author.id,
        channelId: message.raw.channel_id,
        ...(message.raw.guild_id === undefined ? {} : { guildId: message.raw.guild_id }),
        ...(permissionData.user === undefined ? {} : { userPermissions: permissionData.user }),
        ...(permissionData.bot === undefined ? {} : { botPermissions: permissionData.bot }),
        message,
        prefix: match.prefix,
        reply: (response: Sendable) => message.reply(stripEphemeralFlag(response)),
      });
    } catch (error) {
      if (error instanceof CommandRejection) {
        await this.respondWithoutContext(message, error);
        return { status: "rejected", rejection: error };
      }
      const wrapped = new CommandExecutionError(path, error);
      await this.report(wrapped);
      return { status: "failed", error: wrapped };
    }

    return this.executeContext(context);
  }

  private async executeContext(
    context: CommandContext,
    responder?: InteractionResponder,
  ): Promise<CommandHandleResult> {
    const autoDefer = this.startAutoDefer(context);
    try {
      await this.runChecks(context);
      await this.consumeCooldown(context);
      const middleware = [
        ...this.middleware,
        ...context.groups.flatMap((group) => group.middleware),
        ...context.command.middleware,
      ];
      await runMiddleware(middleware, context, () => context.command.run(context));
      if (autoDefer?.completion !== undefined) await autoDefer.completion;
      if (
        context.kind === "slash" &&
        context.interaction.state !== "replied" &&
        context.interaction.state !== "deferred"
      ) {
        throw new Error("The command completed without responding to its interaction.");
      }
      return { status: "completed", path: context.path };
    } catch (error) {
      if (error instanceof CommandRejection) {
        if (responder !== undefined) {
          await this.respondWithResponder(responder, error);
        } else {
          if (context.kind === "prefix") await this.respondWithoutContext(context.message, error);
        }
        return { status: "rejected", rejection: error };
      }
      const wrapped =
        error instanceof CooldownStoreError ? error : new CommandExecutionError(context.path, error);
      await this.report(wrapped, context);
      try {
        await context.reply({
          content: this.messages.error,
          flags: MessageFlags.Ephemeral,
        });
      } catch {
        return { status: "failed", error: wrapped };
      }
      return { status: "failed", error: wrapped };
    } finally {
      if (autoDefer?.timer !== undefined) clearTimeout(autoDefer.timer);
      if (autoDefer?.completion !== undefined) await autoDefer.completion;
    }
  }

  private startAutoDefer(context: CommandContext): AutoDeferHandle | undefined {
    if (context.kind !== "slash" || context.command.autoDefer === undefined || context.command.autoDefer === false) {
      return undefined;
    }
    const configured = context.command.autoDefer;
    const settings = typeof configured === "boolean" ? {} : configured;
    const afterMs = settings.afterMs ?? 2_000;
    const handle: AutoDeferHandle = {};
    handle.timer = setTimeout(() => {
      handle.completion = context.defer({ ephemeral: settings.ephemeral ?? false }).then(
        () => undefined,
        async (error: unknown) => {
          await this.report(new CommandExecutionError(context.path, error), context);
        },
      );
    }, afterMs);
    return handle;
  }

  private async runChecks(context: CommandContext | AutocompleteContext): Promise<void> {
    const nodes = [...context.groups, context.command];
    for (const node of nodes) {
      if (node.guildOnly && context.guildId === undefined) {
        throw new CommandRejection("guild_only", "This command requires a guild.");
      }
      if (node.ownerOnly && !ownerIds(this.host).has(context.userId)) {
        throw new CommandRejection("owner_only", "This command requires a bot owner.");
      }
      if (node.userPermissions !== undefined) {
        const required = resolvePermissionBits(node.userPermissions);
        if (context.userPermissions === undefined) {
          throw new CommandRejection(
            "permission_data_unavailable",
            "User permission data is unavailable.",
            { subject: "user", required },
          );
        }
        if (!hasPermissions(context.userPermissions, required)) {
          throw new CommandRejection("missing_user_permissions", "User permissions are missing.", {
            required,
            missing: required & ~context.userPermissions,
          });
        }
      }
      if (node.botPermissions !== undefined) {
        const required = resolvePermissionBits(node.botPermissions);
        if (context.botPermissions === undefined) {
          throw new CommandRejection(
            "permission_data_unavailable",
            "Bot permission data is unavailable.",
            { subject: "bot", required },
          );
        }
        if (!hasPermissions(context.botPermissions, required)) {
          throw new CommandRejection("missing_bot_permissions", "Bot permissions are missing.", {
            required,
            missing: required & ~context.botPermissions,
          });
        }
      }
    }

    for (const guard of [...this.guards, ...nodes.flatMap((node) => node.guards)]) {
      const result = await guard(context);
      if (result === false) throw new CommandRejection("guard", "This command was blocked.");
      if (typeof result === "object" && result.allowed === false) {
        throw new CommandRejection(
          "guard",
          result.reason ?? "This command was blocked.",
          result.details ?? {},
        );
      }
    }
  }

  private async consumeCooldown(context: CommandContext): Promise<void> {
    const rateLimit = context.command.rateLimit;
    if (rateLimit === undefined) return;

    const scope = rateLimit.scope ?? "user";
    const identity = cooldownIdentity(scope, context);
    let result: CooldownResult;
    try {
      const namespace = this.host.applicationId || this.host.botId || "unbound";
      result = validateCooldownResult(
        await this.cooldowns.consume({
          key: `eunia:command:${namespace}:${context.path.join(":")}:${scope}:${identity}`,
          limit: rateLimit.limit,
          windowMs: rateLimit.windowMs,
          now: Date.now(),
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
        ...(result.saturated === undefined ? {} : { saturated: result.saturated }),
      });
    }
  }

  private async respondWithResponder(
    responder: InteractionResponder,
    rejection: CommandRejection,
  ): Promise<void> {
    try {
      await responder.reply(
        { content: this.rejectionMessage(rejection), flags: MessageFlags.Ephemeral },
      );
    } catch (error) {
      await this.report(new CommandExecutionError(["response"], error));
    }
  }

  private async respondWithoutContext(
    source: Interaction | Message,
    rejection: CommandRejection,
  ): Promise<void> {
    const content = this.rejectionMessage(rejection);
    try {
      if (isInteraction(source)) {
        if (source.kind === "autocomplete") return;
        if (source.state === "pending") {
          await source.respond({ content, flags: MessageFlags.Ephemeral });
        } else {
          await source.followup({ content, flags: MessageFlags.Ephemeral });
        }
      } else {
        await source.reply(content);
      }
    } catch (error) {
      await this.report(new CommandExecutionError(["response"], error));
    }
  }

  private rejectionMessage(rejection: CommandRejection): string {
    const factory: CommandMessageFactory = (() => {
      switch (rejection.code) {
        case "guild_only":
          return this.messages.guildOnly;
        case "owner_only":
          return this.messages.ownerOnly;
        case "missing_user_permissions":
          return this.messages.userPermissions;
        case "missing_bot_permissions":
          return this.messages.botPermissions;
        case "permission_data_unavailable":
          return this.messages.permissionDataUnavailable;
        case "cooldown":
          return this.messages.cooldown;
        case "guard":
          return this.messages.guard;
        case "invalid_input":
          return this.messages.invalidInput;
        case "command_unavailable":
          return this.messages.unavailable;
      }
    })();
    return typeof factory === "function" ? factory(rejection) : factory;
  }

  private async emptyAutocomplete(interaction: Interaction<"autocomplete">): Promise<void> {
    if (interaction.acknowledged) return;
    try {
      await interaction.autocomplete([]);
    } catch {
      return;
    }
  }

  private async report(
    error: CommandError,
    context?: CommandContext | AutocompleteContext,
  ): Promise<void> {
    try {
      await this.host.reportCommandError(error, context);
    } catch {
      return;
    }
  }

  private async fail(error: CommandError): Promise<CommandHandleResult> {
    await this.report(error);
    return { status: "failed", error };
  }
}

class AutocompleteResponder {
  readonly deadline: Promise<void>;
  private claimed: boolean;
  private readonly timer: ReturnType<typeof setTimeout>;
  private resolveDeadline!: () => void;
  private timeoutTask?: Promise<void>;

  constructor(
    private readonly interaction: Interaction<"autocomplete">,
    timeoutMs: number,
    private readonly onTimeoutError: (error: unknown) => Promise<void>,
  ) {
    this.claimed = interaction.acknowledged;
    this.deadline = new Promise((resolve) => {
      this.resolveDeadline = resolve;
    });
    this.timer = setTimeout(() => {
      this.timeoutTask = this.send([]).then(
        () => undefined,
        async (error: unknown) => {
          await this.onTimeoutError(error);
        },
      );
      this.resolveDeadline();
    }, timeoutMs);
  }

  async send(choices: readonly types.ApplicationCommandChoice[]): Promise<boolean> {
    if (this.claimed) return false;
    this.claimed = true;
    try {
      await this.interaction.autocomplete(choices);
      return true;
    } catch (error) {
      this.claimed = this.interaction.acknowledged;
      throw error;
    }
  }

  async sendEmpty(): Promise<void> {
    try {
      await this.send([]);
    } catch {
      return;
    }
  }

  async close(): Promise<void> {
    clearTimeout(this.timer);
    if (this.timeoutTask !== undefined) await this.timeoutTask;
  }
}

/**
 * Serializes reply/defer intent onto the one-initial-callback protocol:
 * respond when unacknowledged, edit the original after a defer, follow up
 * after a reply.
 */
class InteractionResponder {
  private state: "idle" | "claiming" | "deferred" | "replied";
  private deferredEphemeral = false;
  private transition?: Promise<void>;

  constructor(private readonly interaction: Interaction<"command">) {
    this.state =
      interaction.state === "deferred"
        ? "deferred"
        : interaction.state === "pending"
          ? "idle"
          : "replied";
  }

  async reply(response: Sendable): Promise<unknown> {
    if (this.syncFromInteraction() === "in_flight" && this.state !== "claiming") {
      throw new Error("An interaction response is still in progress.");
    }
    if (this.state === "claiming") {
      try {
        await this.transition;
      } catch {
        this.state = "idle";
      }
    }
    if (this.state === "deferred") {
      const requestedEphemeral = ephemeralOf(response);
      if (
        requestedEphemeral !== undefined &&
        requestedEphemeral !== this.deferredEphemeral
      ) {
        await this.interaction.original.delete();
        this.state = "replied";
        return this.interaction.followup(response);
      }
      const result = await this.interaction.original.edit(stripEphemeralFlag(response));
      this.state = "replied";
      return result;
    }
    if (this.state === "replied") return this.interaction.followup(response);

    this.state = "claiming";
    const transition = this.interaction.respond(response).then(
      () => {
        this.state = "replied";
      },
      (error: unknown) => {
        this.state = "idle";
        throw error;
      },
    );
    this.transition = transition;
    await transition;
    return undefined;
  }

  async defer(options?: { readonly ephemeral?: boolean }): Promise<boolean> {
    if (this.syncFromInteraction() === "in_flight" && this.state !== "claiming") {
      return false;
    }
    if (this.state === "claiming") {
      try {
        await this.transition;
      } catch {
        this.state = "idle";
      }
    }
    if (this.state !== "idle") return false;

    this.state = "claiming";
    const transition = this.interaction.defer(options).then(
      () => {
        this.deferredEphemeral = options?.ephemeral ?? false;
        this.state = "deferred";
      },
      (error: unknown) => {
        this.state = "idle";
        throw error;
      },
    );
    this.transition = transition;
    await transition;
    return true;
  }

  private syncFromInteraction(): "ready" | "in_flight" {
    switch (this.interaction.state) {
      case "pending":
        if (this.state !== "claiming") this.state = "idle";
        return "ready";
      case "replied":
        this.state = "replied";
        return "ready";
      case "deferred":
        this.state = "deferred";
        return "ready";
      case "autocomplete":
        this.state = "replied";
        return "ready";
      case "replying":
      case "deferring":
      case "autocompleting":
      case "uncertain":
        return "in_flight";
    }
  }
}

function collectListenerRoutes(
  node: PreparedNode,
  routes: Map<string, ListenerRoute>,
): void {
  if (node.nodeKind === "group") {
    for (const child of node.children) collectListenerRoutes(child, routes);
    return;
  }
  for (const [fieldName, field] of node.listeners) {
    if (routes.has(field.route)) {
      throw new CommandValidationError(
        `Listener route "${field.route}" is already registered.`,
      );
    }
    routes.set(field.route, { prepared: node, fieldName, field });
  }
}

function commandPath(resolved: {
  readonly command: PreparedCommand;
  readonly groups: readonly PreparedGroup[];
}): readonly string[] {
  return Object.freeze([
    resolved.groups[0]?.definition.name ?? resolved.command.definition.name,
    ...resolved.groups.slice(1).map((group) => group.definition.name),
    ...(resolved.groups.length === 0 ? [] : [resolved.command.definition.name]),
  ]);
}

function optionAccess(prepared: PreparedCommand, options: ResolvedOptions): OptionAccess {
  const nameOf = (field: OptionField<unknown, boolean>): string => {
    if (field.name.length === 0 || prepared.fields.get(field.name) !== field) {
      throw new CommandOptionError(
        `The option field is not declared on "${prepared.definition.name}".`,
      );
    }
    return field.name;
  };
  return {
    get: ((field: OptionField<unknown, boolean>) =>
      options.value(nameOf(field))) as OptionAccess["get"],
    has: (field) => options.value(nameOf(field)) !== undefined,
  };
}

function resolveSlashCommand(
  root: PreparedNode,
  options: readonly types.ApplicationCommandInteractionOption[],
): ResolvedCommand {
  if (root.nodeKind === "command") {
    if (
      options.some(
        (option) =>
          option.type === ApplicationCommandOptionType.Subcommand ||
          option.type === ApplicationCommandOptionType.SubcommandGroup,
      )
    ) {
      throw new CommandRejection("command_unavailable", "The command branch is invalid.");
    }
    return { command: root, groups: [], options };
  }

  const branch = options[0];
  if (branch === undefined || options.length !== 1) {
    throw new CommandRejection("command_unavailable", "The command branch is missing.");
  }
  const child = childBySlashName(root, branch.name);
  if (child === undefined) {
    throw new CommandRejection("command_unavailable", "The command branch is unknown.");
  }

  if (branch.type === ApplicationCommandOptionType.Subcommand && child.nodeKind === "command") {
    return { command: child, groups: Object.freeze([root]), options: branch.options ?? [] };
  }
  if (branch.type !== ApplicationCommandOptionType.SubcommandGroup || child.nodeKind !== "group") {
    throw new CommandRejection("command_unavailable", "The command branch has the wrong type.");
  }

  const leafOption = branch.options?.[0];
  if (
    leafOption === undefined ||
    branch.options?.length !== 1 ||
    leafOption.type !== ApplicationCommandOptionType.Subcommand
  ) {
    throw new CommandRejection("command_unavailable", "The subcommand is missing.");
  }
  const leaf = childBySlashName(child, leafOption.name);
  if (leaf === undefined || leaf.nodeKind !== "command") {
    throw new CommandRejection("command_unavailable", "The subcommand is unknown.");
  }
  return {
    command: leaf,
    groups: Object.freeze([root, child]),
    options: leafOption.options ?? [],
  };
}

function resolvePrefixCommand(
  root: PreparedNode,
  tokens: readonly string[],
  caseSensitive: boolean,
): ResolvedPrefixCommand {
  if (root.nodeKind === "command") return { command: root, groups: [], arguments: tokens };

  const branchToken = tokens[0];
  if (branchToken === undefined) {
    throw new CommandRejection("invalid_input", "Choose a subcommand.");
  }
  const child = childByPrefixName(root, branchToken, caseSensitive);
  if (child === undefined) {
    throw new CommandRejection("invalid_input", `Unknown subcommand "${branchToken}".`);
  }
  if (child.nodeKind === "command") {
    return { command: child, groups: Object.freeze([root]), arguments: tokens.slice(1) };
  }

  const leafToken = tokens[1];
  if (leafToken === undefined) {
    throw new CommandRejection("invalid_input", "Choose a subcommand from the group.");
  }
  const leaf = childByPrefixName(child, leafToken, caseSensitive);
  if (leaf === undefined || leaf.nodeKind !== "command") {
    throw new CommandRejection("invalid_input", `Unknown subcommand "${leafToken}".`);
  }
  return {
    command: leaf,
    groups: Object.freeze([root, child]),
    arguments: tokens.slice(2),
  };
}

function childBySlashName(group: PreparedGroup, name: string): PreparedNode | undefined {
  return group.children.find((child) => child.definition.name === name);
}

function childByPrefixName(
  group: PreparedGroup,
  name: string,
  caseSensitive: boolean,
): PreparedNode | undefined {
  return group.children.find((child) => nameMatches(child, name, caseSensitive));
}

function nameMatches(node: PreparedNode, name: string, caseSensitive: boolean): boolean {
  const aliases = node.nodeKind === "command" ? node.command.aliases : node.group.aliases;
  const candidates = [node.definition.name, ...aliases];
  return caseSensitive
    ? candidates.includes(name)
    : candidates.some((candidate) => candidate.toLowerCase() === name.toLowerCase());
}

function interactionPermissions(
  interaction: Interaction,
  options: Pick<CommandHandleOptions, "userPermissions" | "botPermissions">,
): { readonly user?: bigint; readonly bot?: bigint } {
  return {
    ...(options.userPermissions !== undefined
      ? { user: resolvePermissionBits(options.userPermissions) }
      : interaction.raw.member?.permissions === undefined
        ? {}
        : { user: BigInt(interaction.raw.member.permissions) }),
    ...(options.botPermissions !== undefined
      ? { bot: resolvePermissionBits(options.botPermissions) }
      : interaction.raw.app_permissions === undefined
        ? {}
        : { bot: BigInt(interaction.raw.app_permissions) }),
  };
}

function messagePermissions(
  message: Message,
  options: Pick<CommandHandleOptions, "userPermissions" | "botPermissions">,
): { readonly user?: bigint; readonly bot?: bigint } {
  return {
    ...(options.userPermissions !== undefined
      ? { user: resolvePermissionBits(options.userPermissions) }
      : message.raw.member?.permissions === undefined
        ? {}
        : { user: BigInt(message.raw.member.permissions) }),
    ...(options.botPermissions === undefined
      ? {}
      : { bot: resolvePermissionBits(options.botPermissions) }),
  };
}

async function resolvedPermissions(
  options: CommandHandleOptions,
): Promise<Pick<CommandHandleOptions, "userPermissions" | "botPermissions">> {
  const resolved = await options.resolvePermissions?.();
  return {
    ...(options.userPermissions === undefined
      ? resolved?.userPermissions === undefined
        ? {}
        : { userPermissions: resolved.userPermissions }
      : { userPermissions: options.userPermissions }),
    ...(options.botPermissions === undefined
      ? resolved?.botPermissions === undefined
        ? {}
        : { botPermissions: resolved.botPermissions }
      : { botPermissions: options.botPermissions }),
  };
}

function cooldownIdentity(scope: string, context: CommandContext): string {
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

function validateCooldownResult(result: CooldownResult, limit: number): CooldownResult {
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
    throw new TypeError("Cooldown results have an invalid remaining count.");
  }
  if (!Number.isFinite(result.resetAt) || result.resetAt < 0) {
    throw new TypeError("Cooldown results need a valid reset time.");
  }
  if (result.saturated !== undefined && typeof result.saturated !== "boolean") {
    throw new TypeError("Cooldown results need a boolean saturated value.");
  }
  if (!result.allowed && result.remaining !== 0) {
    throw new TypeError("Rejected cooldown results cannot have remaining uses.");
  }
  if (result.allowed && result.saturated === true) {
    throw new TypeError("Saturated cooldown results cannot allow a use.");
  }
  return result;
}

async function runMiddleware(
  middleware: readonly CommandMiddleware[],
  context: CommandContext,
  execute: () => Promise<void> | void,
): Promise<void> {
  const dispatch = async (index: number): Promise<void> => {
    const current = middleware[index];
    if (current === undefined) {
      await execute();
      return;
    }

    let active = true;
    let called = false;
    try {
      await current(context, () => {
        if (!active) throw new MiddlewareError("Command middleware called next after it returned.");
        if (called) throw new MiddlewareError();
        called = true;
        return new LazyNext(async () => {
          if (!active) {
            throw new MiddlewareError("Command middleware used next after it returned.");
          }
          await dispatch(index + 1);
        });
      });
    } finally {
      active = false;
    }
  };

  await dispatch(0);
}

class LazyNext implements Promise<void> {
  readonly [Symbol.toStringTag] = "Promise";
  private promise?: Promise<void>;

  constructor(private readonly start: () => Promise<void>) {}

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.get().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<void | TResult> {
    return this.get().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.get().finally(onfinally);
  }

  private get(): Promise<void> {
    this.promise ??= this.start();
    return this.promise;
  }
}

function validateAutocompleteChoices(
  choices: readonly CommandChoice[],
  focusedType: ApplicationCommandOptionType,
): readonly types.ApplicationCommandChoice[] {
  if (choices.length > 25) throw new RangeError("Autocomplete cannot return more than 25 choices.");
  const expected = focusedType === ApplicationCommandOptionType.String ? "string" : "number";
  const names = new Set<string>();
  const values = new Set<string | number>();
  return choices.map((choice) => {
    if ([...choice.name].length < 1 || [...choice.name].length > 100) {
      throw new RangeError("Autocomplete choice names must have between 1 and 100 characters.");
    }
    if (typeof choice.value !== expected) {
      throw new TypeError("Autocomplete choice values must match the focused option.");
    }
    if (typeof choice.value === "string" && [...choice.value].length > 100) {
      throw new RangeError("Autocomplete string values cannot exceed 100 characters.");
    }
    if (typeof choice.value === "number") {
      const limit =
        focusedType === ApplicationCommandOptionType.Integer
          ? Number.MAX_SAFE_INTEGER
          : 2 ** 53;
      if (
        !Number.isFinite(choice.value) ||
        Math.abs(choice.value) > limit ||
        (focusedType === ApplicationCommandOptionType.Integer &&
          !Number.isSafeInteger(choice.value))
      ) {
        throw new RangeError("Autocomplete number values are outside Discord's range.");
      }
    }
    for (const localized of Object.values(choice.nameLocalizations ?? {})) {
      if (
        localized !== null &&
        localized !== undefined &&
        ([...localized].length < 1 || [...localized].length > 100)
      ) {
        throw new RangeError(
          "Autocomplete choice localizations must have between 1 and 100 characters.",
        );
      }
    }
    if (names.has(choice.name) || values.has(choice.value)) {
      throw new RangeError("Autocomplete choices must have unique names and values.");
    }
    names.add(choice.name);
    values.add(choice.value);
    return {
      name: choice.name,
      ...(choice.nameLocalizations === undefined
        ? {}
        : { name_localizations: choice.nameLocalizations }),
      value: choice.value,
    };
  });
}

function ownerIds(host: CommandHost): ReadonlySet<string> {
  return host.ownerIds instanceof Set ? host.ownerIds : new Set(host.ownerIds);
}

function ephemeralOf(response: Sendable): boolean | undefined {
  if (typeof response === "string" || Array.isArray(response)) return undefined;
  const flags = (response as { flags?: unknown }).flags;
  if (typeof flags !== "number") return undefined;
  return (flags & MessageFlags.Ephemeral) !== 0;
}

function stripEphemeralFlag(response: Sendable): Sendable {
  if (typeof response === "string" || Array.isArray(response)) return response;
  const flags = (response as { flags?: unknown }).flags;
  if (typeof flags !== "number" || (flags & MessageFlags.Ephemeral) === 0) return response;
  const payload = normalizeSendable(response as Sendable);
  return { ...payload, flags: flags & ~MessageFlags.Ephemeral };
}
