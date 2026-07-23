import type { Locale, Localizations } from "@eunia/types";
import { CommandValidationError } from "./errors";

const CHAT_INPUT_NAME = /^[-_'\p{L}\p{N}\p{sc=Devanagari}\p{sc=Thai}]{1,32}$/u;

const SUPPORTED_LOCALES: ReadonlySet<Locale> = new Set([
  "id",
  "da",
  "de",
  "en-GB",
  "en-US",
  "es-ES",
  "es-419",
  "fr",
  "hr",
  "it",
  "lt",
  "hu",
  "nl",
  "no",
  "pl",
  "pt-BR",
  "ro",
  "fi",
  "sv-SE",
  "vi",
  "tr",
  "cs",
  "el",
  "bg",
  "ru",
  "uk",
  "hi",
  "th",
  "zh-CN",
  "ja",
  "zh-TW",
  "ko",
]);

type LocalizationRecord = Readonly<
  Record<string, string | null>
>;

export function characterLength(value: string): number {
  return [...value].length;
}

export function validateChatInputName(
  name: string,
  label: string,
): void {
  if (!CHAT_INPUT_NAME.test(name) || name !== name.toLowerCase()) {
    throw new CommandValidationError(
      `${label} name "${name}" must follow Discord's lowercase chat input name rules.`,
    );
  }
}

export function validateContextName(
  name: string,
  label: string,
): void {
  const length = characterLength(name);
  if (length < 1 || length > 32) {
    throw new CommandValidationError(
      `${label} names must have between 1 and 32 characters.`,
    );
  }
}

export function validateNameLocalizations(
  localizations: unknown,
  label: string,
  contextMenu = false,
): void {
  if (localizations === undefined) return;
  const record = validateLocalizationRecord(localizations, label);
  for (const value of Object.values(record)) {
    if (value === null || value === undefined) continue;
    if (contextMenu) {
      validateContextName(value, `${label} localization`);
    } else {
      validateChatInputName(value, `${label} localization`);
    }
  }
}

export function validateDescriptionLocalizations(
  localizations: unknown,
  label: string,
): void {
  if (localizations === undefined) return;
  const record = validateLocalizationRecord(localizations, label);
  for (const value of Object.values(record)) {
    if (value === null || value === undefined) continue;
    const length = characterLength(value);
    if (length < 1 || length > 100) {
      throw new CommandValidationError(
        `${label} localizations must have between 1 and 100 characters.`,
      );
    }
  }
}

export function validateLocalizedSiblingNames(
  definitions: ReadonlyArray<{
    readonly name: string;
    readonly nameLocalizations?: unknown;
  }>,
  label: string,
): void {
  const locales = new Set<string>();
  const records = new Map<
    (typeof definitions)[number],
    LocalizationRecord | undefined
  >();
  const defaults = new Set(
    definitions.map((definition) => definition.name),
  );

  for (const definition of definitions) {
    const record =
      definition.nameLocalizations === undefined
        ? undefined
        : validateLocalizationRecord(
            definition.nameLocalizations,
            label,
          );
    records.set(definition, record);
    for (const [locale, localized] of Object.entries(record ?? {})) {
      locales.add(locale);
      if (
        localized !== null &&
        localized !== undefined &&
        localized !== definition.name &&
        defaults.has(localized)
      ) {
        throw new CommandValidationError(
          `${label} uses the default name "${localized}" as a localization.`,
        );
      }
    }
  }

  for (const locale of locales) {
    const names = new Set<string>();
    for (const definition of definitions) {
      const name =
        records.get(definition)?.[locale] ?? definition.name;
      if (names.has(name)) {
        throw new CommandValidationError(
          `${label} repeats the localized name "${name}" for ${locale}.`,
        );
      }
      names.add(name);
    }
  }
}

export function localizedLength(
  fallback: string,
  localizations: Localizations | undefined,
): number {
  let longest = characterLength(fallback);
  for (const value of Object.values(localizations ?? {})) {
    if (value !== null && value !== undefined) {
      longest = Math.max(longest, characterLength(value));
    }
  }
  return longest;
}

function validateLocalizationRecord(
  localizations: unknown,
  label: string,
): LocalizationRecord {
  if (
    typeof localizations !== "object" ||
    localizations === null ||
    Array.isArray(localizations)
  ) {
    throw new CommandValidationError(
      `${label} localizations must be an object.`,
    );
  }
  for (const [locale, value] of Object.entries(localizations)) {
    if (!SUPPORTED_LOCALES.has(locale as Locale)) {
      throw new CommandValidationError(
        `${label} has an unknown locale "${locale}".`,
      );
    }
    if (value !== null && typeof value !== "string") {
      throw new CommandValidationError(
        `${label} localization values must be strings or null.`,
      );
    }
  }
  return localizations as LocalizationRecord;
}
