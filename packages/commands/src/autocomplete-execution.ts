import type { Interaction } from "@eunia/structures";
import type * as types from "@eunia/types";
import type { ChatCommand } from "./command";
import {
  AutocompleteError,
  CommandRejection,
} from "./errors";
import {
  commandPath,
  interactionPermissions,
  optionValues,
  resolvedPermissions,
  validateAutocompleteChoices,
  type ResolvedCommand,
} from "./manager-runtime";
import { ResolvedOptions } from "./options";
import {
  checkCommandAccess,
  commandPermissionNeeds,
} from "./policy";
import { AutocompleteResponder } from "./responders";
import type { CommandReporter } from "./reporting";
import type {
  AutocompleteContext,
  CommandGuard,
  CommandHandleOptions,
  CommandHandleResult,
  CommandHost,
} from "./types";

interface AutocompleteExecutionInput {
  readonly interaction: Interaction<"autocomplete">;
  readonly data: types.ApplicationCommandInteractionData;
  readonly resolved: ResolvedCommand;
  readonly handleOptions: CommandHandleOptions;
  readonly host: CommandHost;
  readonly guards: readonly CommandGuard[];
  readonly timeoutMs: number;
  readonly reporter: CommandReporter;
}

export async function executeAutocomplete(
  input: AutocompleteExecutionInput,
): Promise<CommandHandleResult> {
  const {
    interaction,
    data,
    resolved,
    handleOptions,
    host,
    guards,
    timeoutMs,
    reporter,
  } = input;
  const path = commandPath(resolved);
  let errorContext: AutocompleteContext | undefined;
  const responder = new AutocompleteResponder(
    interaction,
    timeoutMs,
    async (error) => {
      await reporter.report(
        new AutocompleteError(path, error),
        errorContext,
      );
    },
  );

  const work = runAutocomplete({
    interaction,
    data,
    resolved,
    handleOptions,
    host,
    guards,
    responder,
    reporter,
    path,
    setErrorContext(context) {
      errorContext = context;
    },
  });

  const outcome = await Promise.race([
    work.then((result) => ({ kind: "work" as const, result })),
    responder.deadline.then(() => ({ kind: "timeout" as const })),
  ]);
  if (outcome.kind === "timeout") {
    void work.then(
      async () => responder.close(),
      async (error: unknown) => {
        await reporter.report(
          new AutocompleteError(path, error),
          errorContext,
        );
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

interface AutocompleteWorkInput extends Omit<
  AutocompleteExecutionInput,
  "timeoutMs"
> {
  readonly responder: AutocompleteResponder;
  readonly path: readonly string[];
  readonly setErrorContext: (
    context: AutocompleteContext,
  ) => void;
}

async function runAutocomplete(
  input: AutocompleteWorkInput,
): Promise<CommandHandleResult> {
  const {
    interaction,
    data,
    resolved,
    handleOptions,
    host,
    guards,
    responder,
    reporter,
    path,
    setErrorContext,
  } = input;
  let context: AutocompleteContext | undefined;
  try {
    const options = ResolvedOptions.fromInteraction(
      resolved.command.options,
      resolved.options,
      data.resolved,
      "autocomplete",
      interaction,
    );
    if (options.focused === undefined) {
      throw new CommandRejection(
        "invalid_input",
        "Autocomplete has no focused option.",
      );
    }
    const field = resolved.command.fields.get(
      options.focused.name,
    );
    if (field?.autocomplete === undefined) {
      throw new CommandRejection(
        "invalid_input",
        "The focused option does not support autocomplete.",
      );
    }
    const userId =
      interaction.raw.member?.user?.id ?? interaction.raw.user?.id;
    if (userId === undefined) {
      throw new CommandRejection(
        "command_unavailable",
        "The command user is missing.",
      );
    }
    const permissionData = interactionPermissions(
      interaction,
      await resolvedPermissions(
        handleOptions,
        commandPermissionNeeds(
          [
            ...resolved.groups.map((group) => group.group),
            resolved.command.command,
          ],
          undefined,
          guards,
        ),
        responder.signal,
      ),
    );
    if (resolved.command.command.type !== "chat") {
      throw new CommandRejection(
        "command_unavailable",
        "The autocomplete command definition is invalid.",
      );
    }
    const command =
      resolved.command.command as unknown as ChatCommand;
    context = Object.freeze({
      kind: "autocomplete" as const,
      command,
      groups: Object.freeze(
        resolved.groups.map((group) => group.group),
      ),
      path,
      interaction,
      signal: responder.signal,
      options: optionValues(resolved.command, options),
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
    setErrorContext(context);
    await checkCommandAccess({
      context,
      host,
      guards,
    });
    const choices = await field.autocomplete(context);
    const serialized = validateAutocompleteChoices(
      choices,
      options.focused.type,
    );
    await responder.send(serialized);
    return { status: "autocomplete", path };
  } catch (error) {
    await responder.sendEmpty();
    if (error instanceof CommandRejection) {
      return { status: "rejected", path, rejection: error };
    }
    const wrapped = new AutocompleteError(path, error);
    await reporter.report(wrapped, context);
    return { status: "failed", path, error: wrapped };
  }
}
