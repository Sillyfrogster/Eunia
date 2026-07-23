import {
  ApplicationCommandOptionType,
  ChannelType,
} from "@eunia/types";
import {
  characterLength,
  validateChatInputName,
  validateDescriptionLocalizations,
  validateLocalizedSiblingNames,
  validateNameLocalizations,
} from "./application-text-validation";
import type { CommandOptionDefinition } from "./definition";
import { CommandValidationError } from "./errors";
import {
  validateChoices,
  validateNumericRange,
  validateOptionType,
  validateStringLengthRange,
} from "./option-validation";
import type { CommandChoice } from "./types";

const MAX_OPTIONS = 25;

export function validateApplicationOptions(
  options: readonly CommandOptionDefinition[],
): void {
  if (options.length > MAX_OPTIONS) {
    throw new CommandValidationError(
      `Commands cannot have more than ${MAX_OPTIONS} options.`,
    );
  }

  const names = new Set<string>();
  validateLocalizedSiblingNames(options, "Command options");
  let sawOptional = false;
  for (const option of options) {
    validateChatInputName(option.name, "Option");
    validateNameLocalizations(
      option.nameLocalizations,
      "Option",
    );
    const descriptionLength = characterLength(option.description);
    if (descriptionLength < 1 || descriptionLength > 100) {
      throw new CommandValidationError(
        `Option "${option.name}" needs a description between 1 and 100 characters.`,
      );
    }
    validateDescriptionLocalizations(
      option.descriptionLocalizations,
      "Option",
    );
    if (names.has(option.name)) {
      throw new CommandValidationError(
        `Option "${option.name}" is declared more than once.`,
      );
    }
    names.add(option.name);

    if (option.required === true && sawOptional) {
      throw new CommandValidationError(
        "Required command options must come before optional options.",
      );
    }
    if (
      option.required !== undefined &&
      typeof option.required !== "boolean"
    ) {
      throw new CommandValidationError(
        `Option "${option.name}" has an invalid required setting.`,
      );
    }
    if (option.required !== true) sawOptional = true;
    validateApplicationOptionRules(option);
  }
}

function validateApplicationOptionRules(
  option: CommandOptionDefinition,
): void {
  validateOptionType(option);
  switch (option.type) {
    case ApplicationCommandOptionType.String:
      validateApplicationChoices(option.choices, "string");
      validateAutocomplete(
        option.autocomplete,
        option.choices,
        option.name,
      );
      validateStringLengthRange(
        option.minLength,
        option.maxLength,
        option.name,
      );
      return;
    case ApplicationCommandOptionType.Integer:
      validateApplicationChoices(
        option.choices,
        "number",
        true,
      );
      validateAutocomplete(
        option.autocomplete,
        option.choices,
        option.name,
      );
      validateNumericRange(
        option.minValue,
        option.maxValue,
        option.name,
        true,
      );
      return;
    case ApplicationCommandOptionType.Number:
      validateApplicationChoices(option.choices, "number");
      validateAutocomplete(
        option.autocomplete,
        option.choices,
        option.name,
      );
      validateNumericRange(
        option.minValue,
        option.maxValue,
        option.name,
        false,
      );
      return;
    case ApplicationCommandOptionType.Channel:
      validateChannelTypes(option);
      return;
    case ApplicationCommandOptionType.Boolean:
    case ApplicationCommandOptionType.User:
    case ApplicationCommandOptionType.Role:
    case ApplicationCommandOptionType.Mentionable:
    case ApplicationCommandOptionType.Attachment:
      return;
  }
}

function validateApplicationChoices(
  choices: readonly CommandChoice[] | undefined,
  expected: "string" | "number",
  integersOnly = false,
): void {
  if (choices === undefined) return;
  if (choices.length > 25) {
    throw new CommandValidationError(
      "Application command options cannot have more than 25 choices.",
    );
  }

  const names = new Set<string>();
  for (const choice of choices) {
    const length = characterLength(choice.name);
    if (length < 1 || length > 100) {
      throw new CommandValidationError(
        "Choice names must have between 1 and 100 characters.",
      );
    }
    validateDescriptionLocalizations(
      choice.nameLocalizations,
      "Choice",
    );
    if (
      typeof choice.value === "string" &&
      characterLength(choice.value) > 100
    ) {
      throw new CommandValidationError(
        `Choice "${choice.name}" cannot exceed 100 characters.`,
      );
    }
    if (names.has(choice.name)) {
      throw new CommandValidationError(
        `Choice "${choice.name}" is declared more than once.`,
      );
    }
    names.add(choice.name);
  }

  validateChoices(choices, expected, integersOnly);
}

function validateChannelTypes(
  option: Extract<
    CommandOptionDefinition,
    { type: ApplicationCommandOptionType.Channel }
  >,
): void {
  if (
    option.channelTypes !== undefined &&
    new Set(option.channelTypes).size !==
      option.channelTypes.length
  ) {
    throw new CommandValidationError(
      `Option "${option.name}" repeats a channel type.`,
    );
  }
  if (option.channelTypes === undefined) return;

  const known = new Set<number>(
    Object.values(ChannelType).filter(
      (value): value is ChannelType =>
        typeof value === "number",
    ),
  );
  if (
    option.channelTypes.some((channelType) =>
      !known.has(channelType)
    )
  ) {
    throw new CommandValidationError(
      "The command has an unknown channel type.",
    );
  }
}

function validateAutocomplete(
  autocomplete: boolean | undefined,
  choices: readonly CommandChoice[] | undefined,
  name: string,
): void {
  if (autocomplete === true && choices !== undefined) {
    throw new CommandValidationError(
      `Option "${name}" cannot use choices and autocomplete together.`,
    );
  }
}
