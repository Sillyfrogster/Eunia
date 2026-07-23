import {
  ApplicationCommandType,
  MessageFlags,
} from "@eunia/types";
import type * as types from "@eunia/types";
import { isInteraction, type Interaction, type Message, type Sendable } from "@eunia/structures";
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
  CommandRejection,
  CooldownStoreError,
  DuplicateCommandError,
  RegistrationFrozenError,
} from "./errors";
import { parseListenerCustomId } from "./listeners";
import {
  applicationCommandKey,
  AutocompleteResponder,
  collectListenerRoutes,
  commandPath,
  cooldownIdentity,
  emptyOptionAccess,
  InteractionResponder,
  interactionPermissions,
  messagePermissions,
  nameMatches,
  optionAccess,
  ownerIds,
  resolvedPermissions,
  resolveMessageCommandTarget,
  resolvePrefixCommand,
  resolveSlashCommand,
  resolveUserCommandTarget,
  runMiddleware,
  stripEphemeralFlag,
  validateApplicationCommandCounts,
  validateAutocompleteChoices,
  validateCooldownResult,
  type ListenerRoute,
  type ResolvedCommand,
  type ResolvedPrefixCommand,
} from "./manager-runtime";
import { ResolvedOptions } from "./options";
import { prepareNode, type PreparedCommand, type PreparedNode } from "./prepare";
import { matchPrefix, normalizePrefixOptions, tokenizePrefix } from "./prefix";
import type {
  AutocompleteContext,
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
  MessageCommandContext,
  PrefixCommandContext,
  PrefixOptions,
  SlashCommandContext,
  UserCommandContext,
} from "./types";
import {
  commandTypeFor,
  hasPermissions,
  resolvePermissionBits,
  serializeCommand,
  validateCommandTree,
} from "./validation";

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
  private readonly applicationRoots = new Map<string, PreparedNode>();
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
    const applicationNames = new Map(this.applicationRoots);
    const prefixNames = new Map(this.prefixRoots);
    const listenerRoutes = new Map(this.listenerRoutes);
    for (const node of prepared) {
      validateCommandTree(node);
      const applicationType = commandTypeFor(node.commandKind);
      if (applicationType !== undefined) {
        const key = applicationCommandKey(applicationType, node.definition.name);
        if (applicationNames.has(key)) {
          throw new DuplicateCommandError(node.definition.name);
        }
        applicationNames.set(key, node);
      }
      if (node.commandKind === "prefix" || node.commandKind === "hybrid") {
        const aliases = node.nodeKind === "command" ? node.command.aliases : node.group.aliases;
        for (const candidate of [node.definition.name, ...aliases]) {
          const key = candidate.toLowerCase();
          if (prefixNames.has(key)) throw new DuplicateCommandError(candidate);
          prefixNames.set(key, node);
        }
      }
      collectListenerRoutes(node, listenerRoutes);
    }
    validateApplicationCommandCounts(applicationNames);

    this.applicationRoots.clear();
    this.prefixRoots.clear();
    this.listenerRoutes.clear();
    for (const [name, node] of applicationNames) this.applicationRoots.set(name, node);
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
      .filter((node) => commandTypeFor(node.commandKind) !== undefined)
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
    if (data === undefined || typeof data.name !== "string") {
      return { status: "ignored" };
    }
    if (
      data.type !== ApplicationCommandType.ChatInput &&
      data.type !== ApplicationCommandType.User &&
      data.type !== ApplicationCommandType.Message
    ) {
      return { status: "ignored" };
    }
    if (interaction.kind === "autocomplete" && data.type !== ApplicationCommandType.ChatInput) {
      return { status: "ignored" };
    }
    const root = this.applicationRoots.get(applicationCommandKey(data.type, data.name));
    if (root === undefined) return { status: "ignored" };
    this.freeze();

    if (data.type === ApplicationCommandType.User || data.type === ApplicationCommandType.Message) {
      if (interaction.kind !== "command" || root.nodeKind !== "command") {
        return { status: "ignored" };
      }
      return this.executeContextMenu(interaction, data, root, handleOptions);
    }

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

  private async executeContextMenu(
    interaction: Interaction<"command">,
    data: types.ApplicationCommandInteractionData,
    prepared: PreparedCommand,
    handleOptions: CommandHandleOptions,
  ): Promise<CommandHandleResult> {
    const path = Object.freeze([prepared.definition.name]);
    const responder = new InteractionResponder(interaction);

    let context: UserCommandContext | MessageCommandContext;
    try {
      const userId = interaction.raw.member?.user?.id ?? interaction.raw.user?.id;
      if (userId === undefined) {
        throw new CommandRejection("command_unavailable", "The command user is missing.");
      }
      const permissionData = interactionPermissions(
        interaction,
        await resolvedPermissions(handleOptions),
      );
      const common = {
        command: prepared.command,
        groups: Object.freeze([]),
        path,
        host: this.host,
        ...emptyOptionAccess(prepared),
        userId,
        ...(interaction.channelId === undefined ? {} : { channelId: interaction.channelId }),
        ...(interaction.guildId === undefined ? {} : { guildId: interaction.guildId }),
        ...(permissionData.user === undefined ? {} : { userPermissions: permissionData.user }),
        ...(permissionData.bot === undefined ? {} : { botPermissions: permissionData.bot }),
        interaction,
        reply: (response: Sendable) => responder.reply(response),
        defer: (options?: { readonly ephemeral?: boolean }) => responder.defer(options),
      };

      context =
        data.type === ApplicationCommandType.User
          ? Object.freeze({
              ...common,
              kind: "user" as const,
              target: resolveUserCommandTarget(interaction, data),
            })
          : Object.freeze({
              ...common,
              kind: "message" as const,
              target: resolveMessageCommandTarget(interaction, data),
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
        context.kind !== "prefix" &&
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
    if (
      context.kind === "prefix" ||
      context.command.autoDefer === undefined ||
      context.command.autoDefer === false
    ) {
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
