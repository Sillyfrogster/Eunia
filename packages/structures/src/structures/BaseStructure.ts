import type { Snowflake } from "@eunia/types";
import type { StructureContext } from "../context";
import { snowflakeTimestamp } from "../utils/discord";

export abstract class BaseStructure<Raw extends { id: Snowflake }> {
  readonly raw: Readonly<Raw>;

  protected constructor(
    raw: Raw,
    protected readonly ctx: StructureContext,
  ) {
    this.raw = freezeSnapshot(raw);
  }

  get id(): Snowflake {
    return this.raw.id;
  }

  get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  toJSON(): Raw {
    return structuredClone(this.raw) as Raw;
  }
}

export function freezeSnapshot<T>(value: T): Readonly<T> {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
