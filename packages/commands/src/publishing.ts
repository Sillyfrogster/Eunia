import type {
  CommandHost,
  CommandPublishResult,
  CommandPublishTarget,
} from "./types";

export async function overwriteApplicationCommands<T>(
  host: CommandHost,
  target: CommandPublishTarget,
  body: readonly unknown[],
): Promise<CommandPublishResult<T>> {
  validatePublishTarget(target);
  const applicationId = host.applicationId;
  if (applicationId.length === 0) {
    throw new TypeError("Command publishing needs an applicationId.");
  }

  if (target.scope === "guild") {
    const commands = await host.rest.put<T>(
      `/applications/${applicationId}/guilds/${target.guildId}/commands`,
      body,
    );
    return { target: "guild", guildId: target.guildId, commands };
  }

  const commands = await host.rest.put<T>(
    `/applications/${applicationId}/commands`,
    body,
  );
  return { target: "global", commands };
}

export function validatePublishTarget(
  target: CommandPublishTarget,
): void {
  if (typeof target !== "object" || target === null) {
    throw new TypeError("Command publishing needs an explicit target.");
  }
  if (target.scope === "global") return;
  if (target.scope !== "guild") {
    throw new TypeError('Command publishing scope must be "global" or "guild".');
  }
  if (typeof target.guildId !== "string" || target.guildId.length === 0) {
    throw new TypeError("Guild command publishing needs a guildId.");
  }
}
