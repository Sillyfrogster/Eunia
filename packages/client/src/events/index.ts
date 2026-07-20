import type { StructureContext } from "@eunia/structures";
import type { Client } from "../client";
import { channelHandlers } from "./channels";
import { guildHandlers } from "./guilds";
import { interactionHandlers } from "./interactions";
import { lifecycleHandlers } from "./lifecycle";
import { messageHandlers } from "./messages";
import type { DispatchHandler } from "./types";

const handlers: Readonly<Record<string, DispatchHandler>> = {
  ...lifecycleHandlers,
  ...guildHandlers,
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
): void {
  handlers[eventName]?.(client, ctx, data, shardId);
}
