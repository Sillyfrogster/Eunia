import type { StructureContext } from "@eunia/structures";
import type { Client } from "../client";
import { applicationHandlers } from "./applications";
import { channelHandlers } from "./channels";
import { guildResourceHandlers } from "./guild-resources";
import { guildHandlers } from "./guilds";
import { interactionHandlers } from "./interactions";
import { lifecycleHandlers } from "./lifecycle";
import { messageHandlers } from "./messages";
import type { DispatchHandler } from "./types";

const handlers: Readonly<Record<string, DispatchHandler>> = {
  ...lifecycleHandlers,
  ...applicationHandlers,
  ...guildHandlers,
  ...guildResourceHandlers,
  ...channelHandlers,
  ...messageHandlers,
  ...interactionHandlers,
};

export function routeDispatch(
  client: Client,
  ctx: StructureContext,
  eventName: string,
  data: unknown,
  shardId = 0,
): void | Promise<void> {
  return handlers[eventName]?.(client, ctx, data, shardId);
}
