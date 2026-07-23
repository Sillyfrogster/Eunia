import { ApplicationCommandType } from "@eunia/types";
import type * as types from "@eunia/types";
import {
  isInteraction,
  type Interaction,
  type Message,
  type Sendable,
} from "@eunia/structures";
import {
  finishAutoDefer,
  startAutoDefer,
  type AutoDeferHandle,
} from "./auto-defer";
import { executeAutocomplete } from "./autocomplete-execution";
import type {
  AnyCommand,
  ChatCommand,
  CommandNode,
  MessageCommand,
  PrefixCommand,
  UserCommand,
} from "./command";
import { MemoryCooldownStore, type CooldownStore } from "./cooldown";
import {
  CommandExecutionError,
  CommandRejection,
  CooldownStoreError,
  DuplicateCommandError,
  EmptyCommandPublishError,
  RegistrationFrozenError,
} from "./errors";
import { executeListener } from "./listener-execution";
import { parseListenerCustomId } from "./listeners";
import {
  applicationCommandKey,
  collectListenerRoutes,
  commandPath,
  interactionPermissions,
  messagePermissions,
  nameMatches,
  optionValues,
  resolvedPermissions,
  resolveMessageCommandTarget,
  resolvePrefixCommand,
  resolveSlashCommand,
  resolveUserCommandTarget,
  validateApplicationCommandCounts,
  type ListenerRoute,
  type ResolvedCommand,
  type ResolvedPrefixCommand,
} from "./manager-runtime";
import { runMiddleware } from "./middleware";
import { ResolvedOptions } from "./options";
import {
  checkCommandAccess,
  commandPermissionNeeds,
  consumeCommandCooldown,
} from "./policy";
import { prepareNode, type PreparedCommand, type PreparedNode } from "./prepare";
import { matchPrefix, normalizePrefixOptions, tokenizePrefix } from "./prefix";
import {
  overwriteApplicationCommands,
  validatePublishTarget,
} from "./publishing";
import { InteractionResponder, stripEphemeralFlag } from "./responders";
import { CommandReporter } from "./reporting";
import { serializeCommand } from "./serialization";
import type {
  CommandContext,
  CommandGuard,
  CommandHandleOptions,
  CommandHandleResult,
  CommandHost,
  CommandManagerOptions,
  CommandMiddleware,
  CommandPublishResult,
  CommandPublishTarget,
  MessageCommandContext,
  PrefixCommandContext,
  PrefixOptions,
  SlashCommandContext,
  UserCommandContext,
} from "./types";
import { validateCommandTree } from "./validation";

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
  private readonly reporter: CommandReporter;
  private readonly prefix?: Required<PrefixOptions>;
  private frozen = false;

  constructor(host: CommandHost, options: CommandManagerOptions = {}) {
    this.host = host;
    this.middleware = Object.freeze([...(options.middleware ?? [])]);
    this.guards = Object.freeze([...(options.guards ?? [])]);
    this.cooldowns = options.cooldownStore ?? new MemoryCooldownStore();
    this.autocompleteTimeoutMs = options.autocompleteTimeoutMs ?? 2_500;
    this.reporter = new CommandReporter(this.host, options.messages);
    if (options.prefix !== undefined) {
      this.prefix = normalizePrefixOptions(options.prefix);
    }

    if (typeof this.host.rest?.put !== "function") {
      throw new TypeError("CommandHost needs REST put access.");
    }
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
      validateCommandTree(
        node,
        this.prefix?.caseSensitive ?? false,
      );
      const applicationType = node.applicationType;
      if (applicationType !== undefined) {
        const key = applicationCommandKey(applicationType, node.definition.name);
        if (applicationNames.has(key)) {
          throw new DuplicateCommandError(node.definition.name);
        }
        applicationNames.set(key, node);
      }
      if (node.prefix) {
        for (const candidate of [node.definition.name, ...node.aliases]) {
          const key = this.prefix?.caseSensitive === true
            ? candidate
            : candidate.toLowerCase();
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
    target: CommandPublishTarget,
  ): Promise<CommandPublishResult<T>> {
    validatePublishTarget(target);
    const body = this.roots
      .filter((node) => node.applicationType !== undefined)
      .map((node) => serializeCommand(node, target.scope === "guild" ? "guild" : "global"));
    if (body.length === 0) throw new EmptyCommandPublishError();

    this.freeze();
    return overwriteApplicationCommands<T>(this.host, target, body);
  }

  async clearPublishedCommands<T = unknown>(
    target: CommandPublishTarget,
  ): Promise<CommandPublishResult<T>> {
    validatePublishTarget(target);
    return overwriteApplicationCommands<T>(this.host, target, []);
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
      return this.handleListener(interaction, handleOptions);
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
          await this.reporter.emptyAutocomplete(interaction);
        } else {
          await this.reporter.rejectionWithoutContext(interaction, error);
        }
        return {
          status: "rejected",
          path: Object.freeze([data.name]),
          rejection: error,
        };
      }
      const wrapped = new CommandExecutionError([data.name], error);
      if (interaction.kind === "autocomplete") {
        await this.reporter.emptyAutocomplete(interaction);
      } else {
        await this.reporter.failure(
          new InteractionResponder(interaction),
        );
      }
      await this.reporter.report(wrapped);
      return {
        status: "failed",
        path: Object.freeze([data.name]),
        error: wrapped,
      };
    }

    if (interaction.kind === "autocomplete") {
      return executeAutocomplete({
        interaction,
        data,
        resolved,
        handleOptions,
        host: this.host,
        guards: this.guards,
        timeoutMs: this.autocompleteTimeoutMs,
        reporter: this.reporter,
      });
    }
    return this.executeSlash(interaction, data, resolved, handleOptions);
  }

  private async handleListener(
    interaction: Interaction<"button" | "select" | "modal">,
    handleOptions: CommandHandleOptions,
  ): Promise<CommandHandleResult> {
    const parsed = parseListenerCustomId(interaction.customId);
    if (parsed === null) return { status: "ignored" };
    const route = this.listenerRoutes.get(parsed.route);
    if (
      route === undefined ||
      route.listener.field.kind !== interaction.kind
    ) {
      return { status: "ignored" };
    }
    this.freeze();
    return executeListener({
      interaction,
      route,
      args: parsed.args,
      handleOptions,
      host: this.host,
      guards: this.guards,
      cooldowns: this.cooldowns,
      reporter: this.reporter,
    });
  }

  private async executeSlash(
    interaction: Interaction<"command">,
    data: types.ApplicationCommandInteractionData,
    resolved: ResolvedCommand,
    handleOptions: CommandHandleOptions,
  ): Promise<CommandHandleResult> {
    const path = commandPath(resolved);
    const responder = new InteractionResponder(interaction);

    let context: SlashCommandContext | undefined;
    const autoDefer = startAutoDefer({
      configured:
        resolved.command.command.type === "chat"
          ? resolved.command.command.autoDefer
          : undefined,
      responder,
      path,
      report: (error, errorContext) =>
        this.reporter.report(error, errorContext),
      context: () => context,
    });
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
        await resolvedPermissions(
          handleOptions,
          commandPermissionNeeds([
            ...resolved.groups.map((group) => group.group),
            resolved.command.command,
          ], undefined, this.guards),
        ),
      );
      if (resolved.command.command.type !== "chat") {
        throw new CommandRejection(
          "command_unavailable",
          "The chat-input command definition is invalid.",
        );
      }
      const command =
        resolved.command.command as unknown as ChatCommand;
      context = Object.freeze({
        kind: "slash" as const,
        command,
        groups: Object.freeze(resolved.groups.map((group) => group.group)),
        path,
        options: optionValues(resolved.command, options),
        listeners: resolved.command.listenerHandles,
        userId,
        ...(interaction.channelId === undefined ? {} : { channelId: interaction.channelId }),
        ...(interaction.guildId === undefined ? {} : { guildId: interaction.guildId }),
        ...(permissionData.user === undefined ? {} : { userPermissions: permissionData.user }),
        ...(permissionData.bot === undefined ? {} : { botPermissions: permissionData.bot }),
        interaction,
        reply: (response: Sendable) => responder.reply(response),
        defer: (options?: { readonly ephemeral?: boolean }) => responder.defer(options),
        modal: (input: types.ModalInteractionResponseData) =>
          responder.modal(input),
      });
    } catch (error) {
      await finishAutoDefer(autoDefer);
      if (error instanceof CommandRejection) {
        await this.reporter.rejection(responder, error);
        return { status: "rejected", path, rejection: error };
      }
      const wrapped = new CommandExecutionError(path, error);
      await this.reporter.failure(responder);
      await this.reporter.report(wrapped);
      return { status: "failed", path, error: wrapped };
    }

    return this.executeContext(context, responder, autoDefer);
  }

  private async executeContextMenu(
    interaction: Interaction<"command">,
    data: types.ApplicationCommandInteractionData,
    prepared: PreparedCommand,
    handleOptions: CommandHandleOptions,
  ): Promise<CommandHandleResult> {
    const path = Object.freeze([prepared.definition.name]);
    const responder = new InteractionResponder(interaction);

    let context: UserCommandContext | MessageCommandContext | undefined;
    const autoDefer = startAutoDefer({
      configured:
        prepared.command.type === "user" ||
        prepared.command.type === "message"
          ? prepared.command.autoDefer
          : undefined,
      responder,
      path,
      report: (error, errorContext) =>
        this.reporter.report(error, errorContext),
      context: () => context,
    });
    try {
      const userId = interaction.raw.member?.user?.id ?? interaction.raw.user?.id;
      if (userId === undefined) {
        throw new CommandRejection("command_unavailable", "The command user is missing.");
      }
      const permissionData = interactionPermissions(
        interaction,
        await resolvedPermissions(
          handleOptions,
          commandPermissionNeeds(
            [prepared.command],
            undefined,
            this.guards,
          ),
        ),
      );
      const common = {
        groups: Object.freeze([]) as readonly [],
        path,
        listeners: prepared.listenerHandles,
        userId,
        ...(interaction.channelId === undefined ? {} : { channelId: interaction.channelId }),
        ...(interaction.guildId === undefined ? {} : { guildId: interaction.guildId }),
        ...(permissionData.user === undefined ? {} : { userPermissions: permissionData.user }),
        ...(permissionData.bot === undefined ? {} : { botPermissions: permissionData.bot }),
        interaction,
        reply: (response: Sendable) => responder.reply(response),
        defer: (options?: { readonly ephemeral?: boolean }) => responder.defer(options),
        modal: (input: types.ModalInteractionResponseData) =>
          responder.modal(input),
      };

      if (data.type === ApplicationCommandType.User) {
        if (prepared.command.type !== "user") {
          throw new CommandRejection(
            "command_unavailable",
            "The user command definition is invalid.",
          );
        }
        const command =
          prepared.command as unknown as UserCommand;
        context = Object.freeze({
          ...common,
          kind: "user" as const,
          command,
          target: resolveUserCommandTarget(interaction, data),
        });
      } else {
        if (prepared.command.type !== "message") {
          throw new CommandRejection(
            "command_unavailable",
            "The message command definition is invalid.",
          );
        }
        const command =
          prepared.command as unknown as MessageCommand;
        context = Object.freeze({
          ...common,
          kind: "message" as const,
          command,
          target: resolveMessageCommandTarget(interaction, data),
        });
      }
    } catch (error) {
      await finishAutoDefer(autoDefer);
      if (error instanceof CommandRejection) {
        await this.reporter.rejection(responder, error);
        return { status: "rejected", path, rejection: error };
      }
      const wrapped = new CommandExecutionError(path, error);
      await this.reporter.failure(responder);
      await this.reporter.report(wrapped);
      return { status: "failed", path, error: wrapped };
    }

    return this.executeContext(context, responder, autoDefer);
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
      await this.reporter.report(wrapped);
      return {
        status: "failed",
        path: Object.freeze(["prefix"]),
        error: wrapped,
      };
    }
    if (match === null) return { status: "ignored" };

    let tokens: readonly string[];
    try {
      tokens = tokenizePrefix(match.content);
    } catch (error) {
      if (error instanceof CommandRejection) {
        await this.reporter.rejectionWithoutContext(message, error);
        return {
          status: "rejected",
          path: Object.freeze(["prefix"]),
          rejection: error,
        };
      }
      const wrapped = new CommandExecutionError(["prefix"], error);
      await this.reporter.failureWithoutContext(message);
      await this.reporter.report(wrapped);
      return {
        status: "failed",
        path: Object.freeze(["prefix"]),
        error: wrapped,
      };
    }
    const rootToken = tokens[0];
    if (rootToken === undefined) return { status: "ignored" };
    const root = this.prefixRoots.get(
      match.caseSensitive ? rootToken : rootToken.toLowerCase(),
    );
    if (root === undefined || !nameMatches(root, rootToken, match.caseSensitive)) {
      return { status: "ignored" };
    }
    this.freeze();

    let resolved: ResolvedPrefixCommand;
    try {
      resolved = resolvePrefixCommand(root, tokens.slice(1), match.caseSensitive);
    } catch (error) {
      if (error instanceof CommandRejection) {
        await this.reporter.rejectionWithoutContext(message, error);
        return {
          status: "rejected",
          path: Object.freeze([root.definition.name]),
          rejection: error,
        };
      }
      const wrapped = new CommandExecutionError([root.definition.name], error);
      await this.reporter.failureWithoutContext(message);
      await this.reporter.report(wrapped);
      return {
        status: "failed",
        path: Object.freeze([root.definition.name]),
        error: wrapped,
      };
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
        await resolvedPermissions(
          handleOptions,
          commandPermissionNeeds([
            ...resolved.groups.map((group) => group.group),
            resolved.command.command,
          ], undefined, this.guards),
        ),
      );
      if (
        resolved.command.command.type !== "chat" &&
        resolved.command.command.type !== "prefix"
      ) {
        throw new CommandRejection(
          "command_unavailable",
          "The prefix command definition is invalid.",
        );
      }
      const command = resolved.command.command as unknown as
        | ChatCommand
        | PrefixCommand;
      context = Object.freeze({
        kind: "prefix" as const,
        command,
        groups: Object.freeze(resolved.groups.map((group) => group.group)),
        path,
        options: optionValues(resolved.command, options),
        listeners: resolved.command.listenerHandles,
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
        await this.reporter.rejectionWithoutContext(message, error);
        return { status: "rejected", path, rejection: error };
      }
      const wrapped = new CommandExecutionError(path, error);
      await this.reporter.failureWithoutContext(message);
      await this.reporter.report(wrapped);
      return { status: "failed", path, error: wrapped };
    }

    return this.executeContext(context);
  }

  private async executeContext(
    context: CommandContext,
    responder?: InteractionResponder,
    autoDefer?: AutoDeferHandle,
  ): Promise<CommandHandleResult> {
    try {
      await checkCommandAccess({
        context,
        host: this.host,
        guards: this.guards,
      });
      await consumeCommandCooldown(context, this.cooldowns, this.host);
      const middleware = [
        ...this.middleware,
        ...context.groups.flatMap((group) => group.middleware),
        ...context.command.middleware,
      ];
      await runMiddleware(middleware, context, () =>
        runCommand(context.command, context),
      );
      await finishAutoDefer(autoDefer);
      if (
        context.kind !== "prefix" &&
        context.interaction.state !== "replied"
      ) {
        throw new Error(
          "The command completed without finishing its interaction response.",
        );
      }
      return { status: "completed", path: context.path };
    } catch (error) {
      await finishAutoDefer(autoDefer);
      if (error instanceof CommandRejection) {
        if (responder !== undefined) {
          await this.reporter.rejection(responder, error);
        } else if (context.kind === "prefix") {
          await this.reporter.rejectionWithoutContext(
            context.message,
            error,
          );
        }
        return {
          status: "rejected",
          path: context.path,
          rejection: error,
        };
      }
      const wrapped =
        error instanceof CooldownStoreError
          ? error
          : new CommandExecutionError(context.path, error);
      if (responder !== undefined) {
        await this.reporter.failure(responder);
      } else if (context.kind === "prefix") {
        await this.reporter.failureWithoutContext(context.message);
      }
      await this.reporter.report(wrapped, context);
      return {
        status: "failed",
        path: context.path,
        error: wrapped,
      };
    } finally {
      await finishAutoDefer(autoDefer);
    }
  }
}

function runCommand(
  command: AnyCommand,
  context: CommandContext,
): void | Promise<void> {
  return (
    command.run as (value: CommandContext) => void | Promise<void>
  )(context);
}
