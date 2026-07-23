import {
  Client,
  Intents,
  command,
  option,
} from "@sillyfrogster/eunia";

const token = process.env.DISCORD_TOKEN?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();

if (!token) throw new Error("Set DISCORD_TOKEN.");
if (!guildId) throw new Error("Set DISCORD_GUILD_ID.");

interface GreetingService {
  format(userId: string, message?: string): string;
}

function createGreetCommand(greetings: GreetingService) {
  return command({
    name: "greet",
    description: "Greet another user",
    rateLimit: { limit: 2, windowMs: 5_000, scope: "user" },
    options: {
      user: option.user({
        description: "The user to greet",
        required: true,
      }),
      message: option.string({
        description: "A short note to include",
        maxLength: 120,
      }),
    },
    async run(context) {
      await context.reply(
        greetings.format(context.options.user.id, context.options.message),
      );
    },
  });
}

const greetings: GreetingService = {
  format(userId, message) {
    const suffix = message ? ` ${message}` : "";
    return `Hello <@${userId}>!${suffix}`;
  },
};

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: {
    commands: [createGreetCommand(greetings)],
    publishOnStart: { scope: "guild", guildId },
  },
});

client.on("ready", (user) => {
  console.log(`Ready as ${user.tag}`);
});

client.on("commandError", (error, context) => {
  console.error(context?.path.join(" ") ?? "command", error.cause);
});

await client.start();
