import {
  command,
  option,
  type SlashCommandContext,
  type StringOptionConfig,
} from "../src";

// @ts-expect-error Fixed choices and autocomplete are mutually exclusive.
const invalidCompletion: StringOptionConfig = {
  choices: [{ name: "One", value: "one" }],
  autocomplete: () => [],
};
void invalidCompletion;

const slashOnly = (_context: SlashCommandContext) => {};
command({
  name: "invalid-handler",
  description: "Use a narrow handler",
  prefix: true,
  // @ts-expect-error A dual-route handler must also accept prefix invocations.
  run: slashOnly,
});

option.string({
  choices: [{ name: "One", value: "one" }],
});
