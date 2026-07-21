import {
  Client,
  Command,
  Intents,
  option,
  type CommandContext,
} from "@sillyfrogster/eunia";

const token = process.env.DISCORD_TOKEN?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();

if (!token) throw new Error("Set DISCORD_TOKEN.");
if (!guildId) throw new Error("Set DISCORD_GUILD_ID.");

class GreetCommand extends Command {
  name = "greet";
  description = "Greet another user";
  kind = "slash" as const;
  rateLimit = { limit: 2, windowMs: 5_000, scope: "user" as const };
  user = option.user({ description: "The user to greet", required: true });
  message = option.string({
    description: "A short note to include",
    maxLength: 120,
  });

  async run(context: CommandContext): Promise<void> {
    const user = context.get(this.user);
    const message = context.get(this.message);
    const suffix = message ? ` ${message}` : "";
    await context.reply(`Hello <@${user.id}>!${suffix}`);
  }
}

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: {
    commands: [new GreetCommand()],
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
