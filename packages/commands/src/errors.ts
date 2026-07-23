export type CommandErrorCode =
  | "invalid_definition"
  | "duplicate_command"
  | "registration_frozen"
  | "empty_publish"
  | "middleware_next_called_twice"
  | "execution_failed"
  | "autocomplete_failed"
  | "cooldown_store_failed";

export type CommandRejectionCode =
  | "guild_only"
  | "owner_only"
  | "missing_user_permissions"
  | "missing_bot_permissions"
  | "permission_data_unavailable"
  | "cooldown"
  | "guard"
  | "invalid_input"
  | "command_unavailable";

export class CommandError extends Error {
  constructor(
    message: string,
    readonly code: CommandErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CommandError";
  }
}

export class CommandValidationError extends CommandError {
  constructor(message: string) {
    super(message, "invalid_definition");
    this.name = "CommandValidationError";
  }
}

export class DuplicateCommandError extends CommandError {
  constructor(name: string) {
    super(`Command name or alias "${name}" is already registered.`, "duplicate_command");
    this.name = "DuplicateCommandError";
  }
}

export class RegistrationFrozenError extends CommandError {
  constructor() {
    super("Commands cannot be registered after handling or publishing starts.", "registration_frozen");
    this.name = "RegistrationFrozenError";
  }
}

export class EmptyCommandPublishError extends CommandError {
  constructor() {
    super(
      "No application commands are registered. Use clearPublishedCommands() to clear a Discord command scope.",
      "empty_publish",
    );
    this.name = "EmptyCommandPublishError";
  }
}

export class MiddlewareError extends CommandError {
  constructor(message = "Command middleware called next more than once.") {
    super(message, "middleware_next_called_twice");
    this.name = "MiddlewareError";
  }
}

export class ReplyVisibilityMismatchError extends Error {
  constructor() {
    super("A deferred reply must keep the visibility chosen when it was deferred.");
    this.name = "ReplyVisibilityMismatchError";
  }
}

export class CommandExecutionError extends CommandError {
  constructor(path: readonly string[], cause: unknown) {
    super(`Command "${path.join(" ")}" failed.`, "execution_failed", { cause });
    this.name = "CommandExecutionError";
  }
}

export class AutocompleteError extends CommandError {
  constructor(path: readonly string[], cause: unknown) {
    super(`Autocomplete for "${path.join(" ")}" failed.`, "autocomplete_failed", { cause });
    this.name = "AutocompleteError";
  }
}

export class CooldownStoreError extends CommandError {
  constructor(cause: unknown) {
    super("The command cooldown store failed.", "cooldown_store_failed", { cause });
    this.name = "CooldownStoreError";
  }
}

export class CommandRejection extends Error {
  constructor(
    readonly code: CommandRejectionCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "CommandRejection";
  }
}
