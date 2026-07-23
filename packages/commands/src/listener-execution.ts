import type {
  Interaction,
  Sendable,
} from "@eunia/structures";
import type * as types from "@eunia/types";
import {
  finishAutoDefer,
  startAutoDefer,
} from "./auto-defer";
import type { CooldownStore } from "./cooldown";
import {
  CommandExecutionError,
  CommandRejection,
  CooldownStoreError,
} from "./errors";
import {
  interactionPermissions,
  resolvedPermissions,
  type ListenerRoute,
} from "./manager-runtime";
import {
  checkCommandAccess,
  commandPermissionNeeds,
  consumeListenerCooldown,
} from "./policy";
import { InteractionResponder } from "./responders";
import type { CommandReporter } from "./reporting";
import type {
  CommandGuard,
  CommandHandleOptions,
  CommandHandleResult,
  CommandHost,
  ListenerContext,
} from "./types";

interface ListenerExecutionInput {
  readonly interaction: Interaction<
    "button" | "select" | "modal"
  >;
  readonly route: ListenerRoute;
  readonly args: readonly string[];
  readonly handleOptions: CommandHandleOptions;
  readonly host: CommandHost;
  readonly guards: readonly CommandGuard[];
  readonly cooldowns: CooldownStore;
  readonly reporter: CommandReporter;
}

export async function executeListener(
  input: ListenerExecutionInput,
): Promise<CommandHandleResult> {
  const {
    interaction,
    route,
    args,
    handleOptions,
    host,
    guards,
    cooldowns,
    reporter,
  } = input;
  const path = Object.freeze([
    ...route.prepared.path,
    route.fieldName,
  ]);
  const userId =
    interaction.raw.member?.user?.id ?? interaction.raw.user?.id;
  if (userId === undefined) return { status: "ignored" };

  const responder = new InteractionResponder(interaction);
  let context: ListenerContext | undefined;
  const autoDefer = startAutoDefer({
    configured: route.listener.field.autoDefer,
    responder,
    path,
    report: (error, errorContext) =>
      reporter.report(error, errorContext),
    context: () => context,
  });

  try {
    const inherited = route.listener.field.inheritAccess
      ? [
          ...route.groups.map((group) => group.group),
          route.prepared.command,
        ]
      : [];
    const permissionData = interactionPermissions(
      interaction,
      await resolvedPermissions(
        handleOptions,
        commandPermissionNeeds(
          inherited,
          route.listener.field.access,
          guards,
        ),
      ),
    );
    context = Object.freeze({
      kind: interaction.kind,
      command: route.prepared.command,
      groups: Object.freeze(
        route.groups.map((group) => group.group),
      ),
      path,
      interaction,
      listeners: route.prepared.listenerBuilders,
      args,
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
      reply: (value: Sendable) => responder.reply(value),
      update: (value: Sendable) => responder.update(value),
      defer: (options?: { readonly ephemeral?: boolean }) =>
        responder.defer(options),
      ...(interaction.kind === "modal"
        ? {}
        : {
            modal: (value: types.ModalInteractionResponseData) =>
              responder.modal(value),
          }),
    }) as ListenerContext;

    await checkCommandAccess({
      context,
      host,
      guards,
      nodes: inherited,
      ...(route.listener.field.access === undefined
        ? {}
        : { additionalAccess: route.listener.field.access }),
    });
    await consumeListenerCooldown(
      context,
      route.listener.field.rateLimit,
      cooldowns,
      host,
    );
    await (route.listener.field.handler as (
      value: ListenerContext,
    ) => unknown)(context);
    await finishAutoDefer(autoDefer);
    if (
      interaction.state !== "replied" &&
      !(
        interaction.state === "deferred" &&
        interaction.deferredResponse === "update"
      )
    ) {
      throw new Error(
        "The listener completed without responding to its interaction.",
      );
    }
    return { status: "completed", path };
  } catch (error) {
    await finishAutoDefer(autoDefer);
    if (error instanceof CommandRejection) {
      await reporter.rejection(responder, error);
      return { status: "rejected", path, rejection: error };
    }
    const wrapped =
      error instanceof CooldownStoreError
        ? error
        : new CommandExecutionError(path, error);
    await reporter.failure(responder);
    await reporter.report(wrapped, context);
    return { status: "failed", path, error: wrapped };
  } finally {
    await finishAutoDefer(autoDefer);
  }
}
