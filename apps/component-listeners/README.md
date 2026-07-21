# Component listeners

This bot shows command-scoped button listeners. Eunia derives each button ID from the command and listener field, so the button still routes after a restart.

## Run it

```sh
cp .env.example .env
bun install
bun run start
```

Set `DISCORD_TOKEN` and `DISCORD_GUILD_ID` before starting the bot. Run `/confirm`, then choose a button.
