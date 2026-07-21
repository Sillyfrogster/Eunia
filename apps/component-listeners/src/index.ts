import {
  Client,
  Command,
  Intents,
  onButton,
  types,
  type CommandContext,
} from "@sillyfrogster/eunia";

const token = process.env.DISCORD_TOKEN?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();

if (!token) throw new Error("Set DISCORD_TOKEN.");
if (!guildId) throw new Error("Set DISCORD_GUILD_ID.");

class ConfirmCommand extends Command {
  name = "confirm";
  description = "Ask for confirmation";
  kind = "slash" as const;

  choose = onButton(async (context, args) => {
    const choice = args[0];
    if (choice !== "yes" && choice !== "no") {
      throw new Error("The button choice is invalid.");
    }

    await context.update({
      content: choice === "yes" ? "Confirmed." : "Cancelled.",
      components: [],
    });
  });

  async run(context: CommandContext): Promise<void> {
    await context.reply({
      content: "Continue?",
      components: [
        {
          type: types.ComponentType.ActionRow,
          components: [
            this.choose.button(
              { label: "Yes", style: types.ButtonStyle.Success },
              "yes",
            ),
            this.choose.button(
              { label: "No", style: types.ButtonStyle.Danger },
              "no",
            ),
          ],
        },
      ],
    });
  }
}

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: {
    commands: [new ConfirmCommand()],
    publishOnStart: { scope: "guild", guildId },
  },
});

client.on("ready", (user) => {
  console.log(`Ready as ${user.tag}`);
});

await client.start();
