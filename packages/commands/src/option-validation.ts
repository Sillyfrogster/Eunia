import { ApplicationCommandOptionType } from "@eunia/types";
import type { CommandOptionDefinition } from "./definition";
import { CommandValidationError } from "./errors";
import type { CommandChoice } from "./types";

const MAX_NUMBER = 2 ** 53;

export function validateOptionType(
  option: CommandOptionDefinition,
): void {
  if (
    !Object.values(ApplicationCommandOptionType).includes(
      option.type,
    )
  ) {
    throw new CommandValidationError(
      `Option "${option.name}" has an invalid type.`,
    );
  }
}

export function validateChoices(
  choices: readonly CommandChoice[] | undefined,
  expected: "string" | "number",
  integersOnly = false,
): void {
  if (choices === undefined) return;
  if (choices.length === 0) {
    throw new CommandValidationError(
      "Choice lists cannot be empty.",
    );
  }

  const values = new Set<string | number>();
  for (const choice of choices) {
    if (typeof choice.value !== expected) {
      throw new CommandValidationError(
        `Choice "${choice.name}" has the wrong value type.`,
      );
    }
    if (
      typeof choice.value === "number" &&
      (!Number.isFinite(choice.value) ||
        Math.abs(choice.value) >
          (integersOnly ? Number.MAX_SAFE_INTEGER : MAX_NUMBER) ||
        (integersOnly && !Number.isSafeInteger(choice.value)))
    ) {
      throw new CommandValidationError(
        `Choice "${choice.name}" must be a finite${integersOnly ? " integer" : " number"}.`,
      );
    }
    if (values.has(choice.value)) {
      throw new CommandValidationError(
        `Choice "${choice.name}" is declared more than once.`,
      );
    }
    values.add(choice.value);
  }
}

export function validateStringLengthRange(
  minimum: number | undefined,
  maximum: number | undefined,
  name: string,
): void {
  if (
    minimum !== undefined &&
    (!Number.isSafeInteger(minimum) ||
      minimum < 0 ||
      minimum > 6_000)
  ) {
    throw new CommandValidationError(
      `Option "${name}" minimum length must be an integer from 0 to 6000.`,
    );
  }
  if (
    maximum !== undefined &&
    (!Number.isSafeInteger(maximum) ||
      maximum < 1 ||
      maximum > 6_000)
  ) {
    throw new CommandValidationError(
      `Option "${name}" maximum length must be an integer from 1 to 6000.`,
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

export function validateNumericRange(
  minimum: number | undefined,
  maximum: number | undefined,
  name: string,
  integersOnly: boolean,
): void {
  for (const value of [minimum, maximum]) {
    if (
      value !== undefined &&
      (!Number.isFinite(value) ||
        Math.abs(value) >
          (integersOnly ? Number.MAX_SAFE_INTEGER : MAX_NUMBER) ||
        (integersOnly && !Number.isSafeInteger(value)))
    ) {
      throw new CommandValidationError(
        `Option "${name}" needs ${integersOnly ? "integer" : "finite"} number limits.`,
      );
    }
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
