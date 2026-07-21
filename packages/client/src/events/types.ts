import type { StructureContext } from "@eunia/structures";
import type { Client } from "../client";

export type DispatchHandler = (
  client: Client,
  ctx: StructureContext,
  data: unknown,
  shardId: number,
) => void | Promise<void>;

export type DispatchHandlerMap = Readonly<Record<string, DispatchHandler>>;
