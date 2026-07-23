import { CommandRejection } from "./errors";
import type { Message } from "@eunia/structures";
import type {
  CommandHost,
  PrefixOptions,
  PrefixResolver,
  PrefixValue,
} from "./types";

export interface PrefixMatch {
  readonly prefix: string;
  readonly content: string;
  readonly caseSensitive: boolean;
}

export function normalizePrefixOptions(value: PrefixResolver | PrefixOptions): Required<PrefixOptions> {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "prefixes" in value
  ) {
    validateBoolean(value.allowMention, "allowMention");
    validateBoolean(value.caseSensitive, "caseSensitive");
    validateBoolean(value.ignoreBots, "ignoreBots");
    const allowMention = value.allowMention ?? false;
    return Object.freeze({
      prefixes: freezeStaticPrefixes(
        value.prefixes,
        allowMention,
      ),
      allowMention,
      caseSensitive: value.caseSensitive ?? false,
      ignoreBots: value.ignoreBots ?? true,
    });
  }
  return Object.freeze({
    prefixes: freezeStaticPrefixes(value as PrefixResolver, false),
    allowMention: false,
    caseSensitive: false,
    ignoreBots: true,
  });
}

function freezeStaticPrefixes(
  prefixes: PrefixResolver,
  allowEmpty: boolean,
): PrefixResolver {
  if (typeof prefixes === "function") return prefixes;
  if (typeof prefixes === "string") {
    if (prefixes.length === 0) {
      throw new RangeError("Static command prefixes cannot be empty.");
    }
    return prefixes;
  }
  if (!Array.isArray(prefixes)) {
    throw new TypeError(
      "Command prefixes must be a string, an array, or a function.",
    );
  }
  if (!allowEmpty && prefixes.length === 0) {
    throw new RangeError("At least one command prefix is required.");
  }
  if (
    prefixes.some(
      (prefix) =>
        typeof prefix !== "string" || prefix.length === 0,
    )
  ) {
    throw new TypeError(
      "Static command prefixes must be non-empty strings.",
    );
  }
  return Object.freeze([...prefixes]);
}

export async function matchPrefix(
  message: Message,
  host: CommandHost,
  options: Required<PrefixOptions>,
): Promise<PrefixMatch | null> {
  if (options.ignoreBots && message.raw.author.bot === true) return null;

  const resolved =
    typeof options.prefixes === "function"
      ? await options.prefixes(message)
      : options.prefixes;
  const prefixes = prefixList(resolved);
  if (options.allowMention) {
    if (host.botId.length === 0) {
      throw new TypeError("Mention prefix matching needs a botId.");
    }
    prefixes.push(`<@${host.botId}>`, `<@!${host.botId}>`);
  }
  prefixes.sort((left, right) => right.length - left.length);

  for (const prefix of prefixes) {
    if (!message.raw.content.startsWith(prefix)) continue;
    const content = message.raw.content.slice(prefix.length).trimStart();
    if (content.length === 0) return null;
    return { prefix, content, caseSensitive: options.caseSensitive };
  }
  return null;
}

export function tokenizePrefix(content: string): readonly string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let started = false;

  for (const character of content) {
    if (escaped) {
      token += character;
      escaped = false;
      started = true;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        token += character;
      }
      started = true;
      continue;
    }
    if (character === '"' || character === "'") {
      if (started) {
        token += character;
      } else {
        quote = character;
      }
      started = true;
      continue;
    }
    if (/\s/u.test(character)) {
      if (started) {
        tokens.push(token);
        token = "";
        started = false;
      }
      continue;
    }
    token += character;
    started = true;
  }

  if (escaped) {
    throw new CommandRejection("invalid_input", "The command ends with an unfinished escape.");
  }
  if (quote !== null) {
    throw new CommandRejection("invalid_input", "The command has an unclosed quote.");
  }
  if (started) tokens.push(token);
  return tokens;
}

function prefixList(value: PrefixValue): string[] {
  if (value === null || value === undefined) return [];
  const candidates =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value
        : invalidPrefixResult();
  const prefixes = new Set<string>();
  for (const prefix of candidates) {
    if (typeof prefix !== "string" || prefix.length === 0) {
      throw new TypeError(
        "Resolved command prefixes must be non-empty strings.",
      );
    }
    prefixes.add(prefix);
  }
  return [...prefixes];
}

function validateBoolean(
  value: boolean | undefined,
  name: string,
): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`Prefix option ${name} must be a boolean.`);
  }
}

function invalidPrefixResult(): never {
  throw new TypeError(
    "A prefix resolver must return a string, an array, null, or undefined.",
  );
}
