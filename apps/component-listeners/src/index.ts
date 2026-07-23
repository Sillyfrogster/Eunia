import {
  Client,
  Intents,
  command,
  onButton,
  types,
} from "@sillyfrogster/eunia";

const token = process.env.DISCORD_TOKEN?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();

if (!token) throw new Error("Set DISCORD_TOKEN.");
if (!guildId) throw new Error("Set DISCORD_GUILD_ID.");

const choose = onButton(async (context) => {
  const choice = context.args[0];
  if (choice !== "yes" && choice !== "no") {
    throw new Error("The button choice is invalid.");
  }

  await context.update({
    content: choice === "yes" ? "Confirmed." : "Cancelled.",
    components: [],
  });
});

const confirm = command({
  name: "confirm",
  description: "Ask for confirmation",
  listeners: { choose },
  async run(context) {
    await context.reply({
      content: "Continue?",
      components: [
        {
          type: types.ComponentType.ActionRow,
          components: [
            context.listeners.choose.button(
              { label: "Yes", style: types.ButtonStyle.Success },
              "yes",
            ),
            context.listeners.choose.button(
              { label: "No", style: types.ButtonStyle.Danger },
              "no",
            ),
          ],
        },
      ],
    });
  },
});

const client = new Client({
  token,
  intents: [Intents.Guilds],
  commands: {
    commands: [confirm],
    publishOnStart: { scope: "guild", guildId },
  },
});

client.on("ready", (user) => {
  console.log(`Ready as ${user.tag}`);
});

await client.start();
