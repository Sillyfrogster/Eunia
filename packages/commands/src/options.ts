import { ApplicationCommandOptionType } from "@eunia/types";
import type * as types from "@eunia/types";
import { CommandRejection } from "./errors";
import type { CommandOptionDefinition } from "./definition";
import type {
  FocusedOption,
  ResolvedAttachment,
  ResolvedChannel,
  ResolvedMentionable,
  ResolvedRole,
  ResolvedStructureSource,
  ResolvedUser,
} from "./types";

export type CommandOptionValue =
  | string
  | number
  | boolean
  | ResolvedUser
  | ResolvedChannel
  | ResolvedRole
  | ResolvedMentionable
  | ResolvedAttachment;

interface StoredOption {
  readonly definition: CommandOptionDefinition;
  readonly value: CommandOptionValue;
}

export class ResolvedOptions {
  readonly focused?: FocusedOption;
  private readonly values: ReadonlyMap<string, StoredOption>;

  private constructor(
    values: ReadonlyMap<string, StoredOption>,
    focused?: FocusedOption,
  ) {
    this.values = values;
    if (focused !== undefined) this.focused = focused;
  }

  static fromInteraction(
    definitions: readonly CommandOptionDefinition[],
    options: readonly types.ApplicationCommandInteractionOption[],
    resolved: types.ResolvedData | undefined,
    mode: "execute" | "autocomplete" = "execute",
    structures?: ResolvedStructureSource,
  ): ResolvedOptions {
    const known = new Map(definitions.map((definition) => [definition.name, definition]));
    const values = new Map<string, StoredOption>();
    let focused: FocusedOption | undefined;
    const seen = new Set<string>();
    let focusedCount = 0;

    for (const option of options) {
      if (seen.has(option.name)) {
        throw new CommandRejection("invalid_input", `Option "${option.name}" is repeated.`);
      }
      seen.add(option.name);
      const definition = known.get(option.name);
      if (definition === undefined) {
        throw new CommandRejection("invalid_input", `Unknown option "${option.name}".`);
      }
      if (definition.type !== option.type) {
        throw new CommandRejection("invalid_input", `Option "${option.name}" has the wrong type.`);
      }
      if (mode === "execute" && option.focused !== undefined) {
        throw new CommandRejection("invalid_input", "Command options cannot be focused during execution.");
      }
      if (mode === "autocomplete" && option.focused === true) focusedCount += 1;
      if (option.value === undefined) continue;

      const value = resolveInteractionValue(
        definition,
        option.value,
        resolved,
        mode === "autocomplete" && option.focused === true,
        structures,
      );
      values.set(option.name, { definition, value });
      if (option.focused === true) {
        if (
          definition.type !== ApplicationCommandOptionType.String &&
          definition.type !== ApplicationCommandOptionType.Integer &&
          definition.type !== ApplicationCommandOptionType.Number
        ) {
          throw new CommandRejection("invalid_input", `Option "${option.name}" cannot be focused.`);
        }
        focused = { name: option.name, type: definition.type, value: option.value as string | number };
      }
    }

    if (mode === "execute") {
      const missing = definitions.find(
        (definition) => definition.required === true && !values.has(definition.name),
      );
      if (missing !== undefined) {
        throw new CommandRejection(
          "invalid_input",
          `Missing required option "${missing.name}".`,
          { option: missing.name },
        );
      }
    } else if (focusedCount !== 1 || focused === undefined) {
      throw new CommandRejection(
        "invalid_input",
        "Autocomplete needs exactly one focused option.",
      );
    }

    return new ResolvedOptions(values, focused);
  }

  static fromPrefix(
    definitions: readonly CommandOptionDefinition[],
    tokens: readonly string[],
    message: types.Message,
  ): ResolvedOptions {
    const values = new Map<string, StoredOption>();
    let cursor = 0;
    let attachmentCursor = 0;

    for (const definition of definitions) {
      if (definition.type === ApplicationCommandOptionType.Attachment) {
        const attachment = message.attachments[attachmentCursor];
        if (attachment === undefined) {
          if (definition.required !== true) continue;
          throw new CommandRejection(
            "invalid_input",
            `Prefix option "${definition.name}" needs an attached file.`,
            { option: definition.name },
          );
        }
        values.set(definition.name, {
          definition,
          value: { id: attachment.id, raw: attachment },
        });
        attachmentCursor += 1;
        continue;
      }

      const token = tokens[cursor];
      if (token === undefined) {
        if (definition.required === true) {
          throw new CommandRejection(
            "invalid_input",
            `Missing required option "${definition.name}".`,
            { option: definition.name },
          );
        }
        continue;
      }

      const raw =
        definition.type === ApplicationCommandOptionType.String && definition.prefix?.rest === true
          ? tokens.slice(cursor).join(" ")
          : token;
      const value = parsePrefixValue(definition, raw);
      values.set(definition.name, { definition, value });
      cursor =
        definition.type === ApplicationCommandOptionType.String && definition.prefix?.rest === true
          ? tokens.length
          : cursor + 1;
    }

    if (cursor < tokens.length) {
      throw new CommandRejection("invalid_input", "Too many command arguments were provided.", {
        extra: tokens.slice(cursor),
      });
    }

    return new ResolvedOptions(values);
  }

  /** Reads a resolved value by wire name; undefined when the option is absent. */
  value(name: string): CommandOptionValue | undefined {
    return this.values.get(name)?.value;
  }
}

function resolveInteractionValue(
  definition: CommandOptionDefinition,
  value: string | number | boolean,
  resolved: types.ResolvedData | undefined,
  focused: boolean,
  structures?: ResolvedStructureSource,
): CommandOptionValue {
  switch (definition.type) {
    case ApplicationCommandOptionType.String:
      if (typeof value !== "string") return invalidType(definition.name);
      if (!focused) validateStringValue(definition, value);
      return value;
    case ApplicationCommandOptionType.Integer:
      if (typeof value !== "number" || !Number.isSafeInteger(value)) return invalidType(definition.name);
      if (!focused) validateNumberValue(definition, value);
      return value;
    case ApplicationCommandOptionType.Number:
      if (typeof value !== "number" || !Number.isFinite(value)) return invalidType(definition.name);
      if (!focused) validateNumberValue(definition, value);
      return value;
    case ApplicationCommandOptionType.Boolean:
      if (typeof value !== "boolean") return invalidType(definition.name);
      return value;
    case ApplicationCommandOptionType.User: {
      if (typeof value !== "string") return invalidType(definition.name);
      const raw = resolved?.users?.[value];
      const user = structures?.resolvedUser(value);
      return {
        id: value,
        ...(raw === undefined ? {} : { raw }),
        ...(user === undefined ? {} : { user }),
      };
    }
    case ApplicationCommandOptionType.Channel: {
      if (typeof value !== "string") return invalidType(definition.name);
      const raw = resolved?.channels?.[value];
      const channel = structures?.resolvedChannel(value);
      return {
        id: value,
        ...(raw === undefined ? {} : { raw }),
        ...(channel === undefined ? {} : { channel }),
      };
    }
    case ApplicationCommandOptionType.Role: {
      if (typeof value !== "string") return invalidType(definition.name);
      const raw = resolved?.roles?.[value];
      const role = structures?.resolvedRole(value);
      return {
        id: value,
        ...(raw === undefined ? {} : { raw }),
        ...(role === undefined ? {} : { role }),
      };
    }
    case ApplicationCommandOptionType.Mentionable: {
      if (typeof value !== "string") return invalidType(definition.name);
      const rawRole = resolved?.roles?.[value];
      if (rawRole !== undefined) {
        const role = structures?.resolvedRole(value);
        return {
          kind: "role",
          id: value,
          raw: rawRole,
          ...(role === undefined ? {} : { role }),
        };
      }
      const raw = resolved?.users?.[value];
      const user = structures?.resolvedUser(value);
      return {
        kind: "user",
        id: value,
        ...(raw === undefined ? {} : { raw }),
        ...(user === undefined ? {} : { user }),
      };
    }
    case ApplicationCommandOptionType.Attachment: {
      if (typeof value !== "string") return invalidType(definition.name);
      const raw = resolved?.attachments?.[value];
      return raw === undefined ? { id: value } : { id: value, raw };
    }
  }
}

function parsePrefixValue(
  definition: Exclude<CommandOptionDefinition, { type: ApplicationCommandOptionType.Attachment }>,
  token: string,
): CommandOptionValue {
  switch (definition.type) {
    case ApplicationCommandOptionType.String:
      validateStringValue(definition, token);
      return token;
    case ApplicationCommandOptionType.Integer: {
      if (!/^-?\d+$/u.test(token)) return invalidValue(definition.name, "an integer");
      const value = Number(token);
      if (!Number.isSafeInteger(value)) return invalidValue(definition.name, "a safe integer");
      validateNumberValue(definition, value);
      return value;
    }
    case ApplicationCommandOptionType.Number: {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(token)) {
        return invalidValue(definition.name, "a number");
      }
      const value = Number(token);
      if (!Number.isFinite(value) || token.trim() === "") return invalidValue(definition.name, "a number");
      validateNumberValue(definition, value);
      return value;
    }
    case ApplicationCommandOptionType.Boolean: {
      const value = parseBoolean(token);
      if (value === undefined) return invalidValue(definition.name, "true or false");
      return value;
    }
    case ApplicationCommandOptionType.User:
      return { id: parseId(token, definition.name, "user") };
    case ApplicationCommandOptionType.Channel:
      return { id: parseId(token, definition.name, "channel") };
    case ApplicationCommandOptionType.Role:
      return { id: parseId(token, definition.name, "role") };
    case ApplicationCommandOptionType.Mentionable: {
      const role = /^<@&(\d{17,20})>$/u.exec(token)?.[1];
      if (role !== undefined) return { kind: "role", id: role };
      return { kind: "user", id: parseId(token, definition.name, "user") };
    }
  }
}

function validateStringValue(
  definition: Extract<CommandOptionDefinition, { type: ApplicationCommandOptionType.String }>,
  value: string,
): void {
  const length = [...value].length;
  if (definition.minLength !== undefined && length < definition.minLength) {
    invalidValue(definition.name, `at least ${definition.minLength} characters`);
  }
  if (definition.maxLength !== undefined && length > definition.maxLength) {
    invalidValue(definition.name, `at most ${definition.maxLength} characters`);
  }
  if (definition.choices !== undefined && !definition.choices.some((choice) => choice.value === value)) {
    invalidValue(definition.name, "one of its listed choices");
  }
}

function validateNumberValue(
  definition: Extract<
    CommandOptionDefinition,
    { type: ApplicationCommandOptionType.Integer | ApplicationCommandOptionType.Number }
  >,
  value: number,
): void {
  const maximum =
    definition.type === ApplicationCommandOptionType.Integer
      ? Number.MAX_SAFE_INTEGER
      : 2 ** 53;
  if (Math.abs(value) > maximum) {
    invalidValue(definition.name, `between ${-maximum} and ${maximum}`);
  }
  if (definition.minValue !== undefined && value < definition.minValue) {
    invalidValue(definition.name, `at least ${definition.minValue}`);
  }
  if (definition.maxValue !== undefined && value > definition.maxValue) {
    invalidValue(definition.name, `at most ${definition.maxValue}`);
  }
  if (definition.choices !== undefined && !definition.choices.some((choice) => choice.value === value)) {
    invalidValue(definition.name, "one of its listed choices");
  }
}

function parseBoolean(value: string): boolean | undefined {
  switch (value.toLowerCase()) {
    case "true":
    case "yes":
    case "on":
    case "1":
      return true;
    case "false":
    case "no":
    case "off":
    case "0":
      return false;
    default:
      return undefined;
  }
}

function parseId(value: string, name: string, kind: "user" | "channel" | "role"): string {
  const patterns = {
    user: /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/u,
    channel: /^(?:<#(\d{17,20})>|(\d{17,20}))$/u,
    role: /^(?:<@&(\d{17,20})>|(\d{17,20}))$/u,
  } as const;
  const match = patterns[kind].exec(value);
  const id = match?.[1] ?? match?.[2];
  if (id === undefined) return invalidValue(name, `a ${kind} mention or ID`);
  return id;
}

function invalidType(name: string): never {
  throw new CommandRejection("invalid_input", `Option "${name}" has an invalid value type.`);
}

function invalidValue(name: string, expected: string): never {
  throw new CommandRejection("invalid_input", `Option "${name}" must be ${expected}.`, {
    option: name,
  });
}

