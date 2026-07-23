import { MessageFlags } from "@eunia/types";
import {
  isInteraction,
  type Interaction,
  type Message,
} from "@eunia/structures";
import {
  CommandExecutionError,
  CommandRejection,
  type CommandError,
} from "./errors";
import type { InteractionResponder } from "./responders";
import type {
  CommandAccessContext,
  CommandHost,
  CommandMessageFactory,
  CommandMessages,
} from "./types";

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

export class CommandReporter {
  private readonly messages: Required<CommandMessages>;

  constructor(
    private readonly host: CommandHost,
    messages: CommandMessages | undefined,
  ) {
    if (
      messages !== undefined &&
      (typeof messages !== "object" ||
        messages === null ||
        Array.isArray(messages))
    ) {
      throw new TypeError("Command messages must be an object.");
    }
    const configured = { ...DEFAULT_MESSAGES, ...messages };
    validateMessages(configured);
    this.messages = Object.freeze(configured);
  }

  async rejection(
    responder: InteractionResponder,
    rejection: CommandRejection,
  ): Promise<void> {
    const resolved = this.safeRejectionMessage(rejection);
    try {
      await responder.privateReply({
        content: resolved.content,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await this.report(new CommandExecutionError(["response"], error));
    }
    if (resolved.error !== undefined) {
      await this.report(resolved.error);
    }
  }

  async failure(responder: InteractionResponder): Promise<void> {
    try {
      await responder.privateReply({
        content: this.messages.error,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await this.report(new CommandExecutionError(["response"], error));
    }
  }

  async rejectionWithoutContext(
    source: Interaction | Message,
    rejection: CommandRejection,
  ): Promise<void> {
    const resolved = this.safeRejectionMessage(rejection);
    if (
      isInteraction(source) &&
      source.kind === "autocomplete"
    ) {
      if (resolved.error !== undefined) {
        await this.report(resolved.error);
      }
      return;
    }
    try {
      if (isInteraction(source)) {
        if (source.state === "pending") {
          await source.respond({
            content: resolved.content,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await source.followup({
            content: resolved.content,
            flags: MessageFlags.Ephemeral,
          });
        }
      } else {
        await source.reply(resolved.content);
      }
    } catch (error) {
      await this.report(new CommandExecutionError(["response"], error));
    }
    if (resolved.error !== undefined) {
      await this.report(resolved.error);
    }
  }

  async failureWithoutContext(source: Interaction | Message): Promise<void> {
    try {
      if (isInteraction(source)) {
        if (source.kind === "autocomplete") return;
        if (source.state === "pending") {
          await source.respond({
            content: this.messages.error,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await source.followup({
            content: this.messages.error,
            flags: MessageFlags.Ephemeral,
          });
        }
      } else {
        await source.reply(this.messages.error);
      }
    } catch (error) {
      await this.report(new CommandExecutionError(["response"], error));
    }
  }

  async emptyAutocomplete(
    interaction: Interaction<"autocomplete">,
  ): Promise<void> {
    if (interaction.acknowledged) return;
    try {
      await interaction.autocomplete([]);
    } catch {
      return;
    }
  }

  async report(
    error: CommandError,
    context?: CommandAccessContext,
  ): Promise<void> {
    try {
      await this.host.reportCommandError(error, context);
    } catch {
      return;
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
    const message =
      typeof factory === "function" ? factory(rejection) : factory;
    if (typeof message !== "string") {
      throw new TypeError(
        "Command rejection messages must resolve to strings.",
      );
    }
    return message;
  }

  private safeRejectionMessage(
    rejection: CommandRejection,
  ): {
    readonly content: string;
    readonly error?: CommandExecutionError;
  } {
    try {
      return { content: this.rejectionMessage(rejection) };
    } catch (error) {
      return {
        content: this.messages.error,
        error: new CommandExecutionError(["response"], error),
      };
    }
  }
}

function validateMessages(
  messages: Required<CommandMessages>,
): void {
  for (const [name, value] of Object.entries(messages)) {
    const valid =
      name === "error"
        ? typeof value === "string"
        : typeof value === "string" || typeof value === "function";
    if (!valid) {
      const expected =
        name === "error" ? "a string" : "a string or message function";
      throw new TypeError(
        `Command message ${name} must be ${expected}.`,
      );
    }
  }
}
