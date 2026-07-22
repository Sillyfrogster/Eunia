import type { StructureContext } from "@eunia/structures";
import type * as types from "@eunia/types";

export function patchCachedGuild(
  ctx: StructureContext,
  guildId: string,
  patch: Partial<types.Guild>,
): void {
  const guild = ctx.cache.guilds.resolve(guildId);
  if (guild !== undefined) ctx.cache.guilds.set(guildId, { ...guild, ...patch });
}
