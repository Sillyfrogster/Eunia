/**
 * The class body is the command: every fact is a named field, every behavior
 * a method, no constructor. Option fields (option.*) and listener fields
 * (onButton/onSelect/onModal) are discovered by the manager at registration.
 */
import type {
  ApplicationIntegrationType,
  InteractionContextType,
  Localizations,
  PermissionInput,
} from "@eunia/types";
import type {
  AutoDeferOptions,
  AutocompleteContext,
  Awaitable,
  CommandChoice,
  CommandContext,
  CommandGuard,
  CommandMiddleware,
  CommandRateLimit,
  MessageCommandContext,
  UserCommandContext,
} from "./types";

export type CommandKind = "slash" | "prefix" | "hybrid" | "user" | "message";

export abstract class Command {
  abstract readonly name: string;
  abstract readonly kind: CommandKind;
  readonly description: string = "";

  readonly aliases: readonly string[] = [];
  readonly middleware: readonly CommandMiddleware[] = [];
  readonly guards: readonly CommandGuard[] = [];
  readonly guildOnly: boolean = false;
  readonly ownerOnly: boolean = false;
  readonly userPermissions?: PermissionInput;
  readonly botPermissions?: PermissionInput;
  readonly rateLimit?: CommandRateLimit;
  readonly autoDefer?: boolean | AutoDeferOptions;
  /** Free-form user space; the library never interprets it. */
  readonly meta: Readonly<Record<string, unknown>> = {};

  readonly nameLocalizations?: Localizations;
  readonly descriptionLocalizations?: Localizations;
  readonly defaultMemberPermissions?: PermissionInput | null;
  readonly contexts?: readonly InteractionContextType[] | null;
  readonly integrationTypes?: readonly ApplicationIntegrationType[];
  readonly nsfw?: boolean;

  abstract run(context: CommandContext): Awaitable<void>;

  autocomplete(_context: AutocompleteContext): Awaitable<readonly CommandChoice[]> {
    return [];
  }
}

export abstract class UserCommand extends Command {
  readonly kind = "user" as const;
  abstract run(context: UserCommandContext): Awaitable<void>;
}

export abstract class MessageCommand extends Command {
  readonly kind = "message" as const;
  abstract run(context: MessageCommandContext): Awaitable<void>;
}

/**
 * A group shares the field anatomy and lists child classes; shared policy
 * (permissions, guildOnly, meta) applies to every child.
 */
export abstract class CommandGroup {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly children: readonly CommandNodeClass[];

  readonly aliases: readonly string[] = [];
  readonly middleware: readonly CommandMiddleware[] = [];
  readonly guards: readonly CommandGuard[] = [];
  readonly guildOnly: boolean = false;
  readonly ownerOnly: boolean = false;
  readonly userPermissions?: PermissionInput;
  readonly botPermissions?: PermissionInput;
  readonly meta: Readonly<Record<string, unknown>> = {};

  readonly nameLocalizations?: Localizations;
  readonly descriptionLocalizations?: Localizations;
  readonly defaultMemberPermissions?: PermissionInput | null;
  readonly contexts?: readonly InteractionContextType[] | null;
  readonly integrationTypes?: readonly ApplicationIntegrationType[];
  readonly nsfw?: boolean;
}

export type CommandNode = Command | CommandGroup;
export type CommandNodeClass = new () => CommandNode;
