import { ApplicationCommandOptionType } from "@eunia/types";
import type { CommandOptionDefinition } from "./definition";
import { CommandValidationError } from "./errors";
import {
  validateChoices,
  validateNumericRange,
  validateOptionType,
  validateStringLengthRange,
} from "./option-validation";

export function validatePrefixOptions(
  options: readonly CommandOptionDefinition[],
  prefixOnly: boolean,
): void {
  const names = new Set<string>();
  let sawOptional = false;
  for (const [index, option] of options.entries()) {
    if (option.name.length === 0) {
      throw new CommandValidationError(
        "Prefix option names cannot be empty.",
      );
    }
    if (names.has(option.name)) {
      throw new CommandValidationError(
        `Prefix option "${option.name}" is declared more than once.`,
      );
    }
    names.add(option.name);
    if (option.required === true && sawOptional) {
      throw new CommandValidationError(
        "Required prefix options must come before optional options.",
      );
    }
    if (
      option.required !== undefined &&
      typeof option.required !== "boolean"
    ) {
      throw new CommandValidationError(
        `Prefix option "${option.name}" has an invalid required setting.`,
      );
    }
    if (option.required !== true) sawOptional = true;
    if (prefixOnly) {
      validatePrefixOnlySettings(option);
    }
    validatePrefixOptionRules(
      option,
      index,
      options.length,
      prefixOnly,
    );
  }
}

function validatePrefixOnlySettings(
  option: CommandOptionDefinition,
): void {
  if (
    "autocomplete" in option &&
    option.autocomplete !== undefined
  ) {
    throw new CommandValidationError(
      `Prefix-only option "${option.name}" cannot use autocomplete.`,
    );
  }
  if (option.nameLocalizations !== undefined) {
    throw new CommandValidationError(
      `Prefix-only option "${option.name}" cannot localize its name.`,
    );
  }
  if (option.descriptionLocalizations !== undefined) {
    throw new CommandValidationError(
      `Prefix-only option "${option.name}" cannot localize its description.`,
    );
  }
  if ("choices" in option) {
    const localizedChoice = option.choices?.find(
      (choice) => choice.nameLocalizations !== undefined,
    );
    if (localizedChoice !== undefined) {
      throw new CommandValidationError(
        `Prefix-only option "${option.name}" cannot localize the choice "${localizedChoice.name}".`,
      );
    }
  }
}

function validatePrefixOptionRules(
  option: CommandOptionDefinition,
  index: number,
  optionCount: number,
  prefixOnly: boolean,
): void {
  validateOptionType(option);
  switch (option.type) {
    case ApplicationCommandOptionType.String:
      validateChoices(option.choices, "string");
      if (prefixOnly) {
        validatePrefixStringLengthRange(
          option.minLength,
          option.maxLength,
          option.name,
        );
      } else {
        validateStringLengthRange(
          option.minLength,
          option.maxLength,
          option.name,
        );
      }
      if (
        option.prefix?.rest === true &&
        index !== optionCount - 1
      ) {
        throw new CommandValidationError(
          `Rest option "${option.name}" must be the last option.`,
        );
      }
      return;
    case ApplicationCommandOptionType.Integer:
      validateChoices(option.choices, "number", true);
      validateNumericRange(
        option.minValue,
        option.maxValue,
        option.name,
        true,
      );
      return;
    case ApplicationCommandOptionType.Number:
      validateChoices(option.choices, "number");
      validateNumericRange(
        option.minValue,
        option.maxValue,
        option.name,
        false,
      );
      return;
    case ApplicationCommandOptionType.Channel:
      if (prefixOnly && option.channelTypes !== undefined) {
        throw new CommandValidationError(
          `Prefix-only option "${option.name}" cannot filter channel types.`,
        );
      }
      return;
    case ApplicationCommandOptionType.Boolean:
    case ApplicationCommandOptionType.User:
    case ApplicationCommandOptionType.Role:
    case ApplicationCommandOptionType.Mentionable:
    case ApplicationCommandOptionType.Attachment:
      return;
  }
}

function validatePrefixStringLengthRange(
  minimum: number | undefined,
  maximum: number | undefined,
  name: string,
): void {
  if (
    minimum !== undefined &&
    (!Number.isSafeInteger(minimum) || minimum < 0)
  ) {
    throw new CommandValidationError(
      `Option "${name}" minimum length must be a non-negative integer.`,
    );
  }
  if (
    maximum !== undefined &&
    (!Number.isSafeInteger(maximum) || maximum < 1)
  ) {
    throw new CommandValidationError(
      `Option "${name}" maximum length must be a positive integer.`,
    );
  }
  if (
    minimum !== undefined &&
    maximum !== undefined &&
    minimum > maximum
  ) {
    throw new CommandValidationError(
      `Option "${name}" has a minimum above its maximum.`,
    );
  }
}
