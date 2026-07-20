import type { Snowflake } from "@eunia/types";
import type { StructureContext } from "../context";
import { snowflakeTimestamp } from "../utils/discord";

export abstract class BaseStructure<Raw extends { id: Snowflake }> {
  readonly raw: Readonly<Raw>;

  protected constructor(
    raw: Raw,
    protected readonly ctx: StructureContext,
  ) {
    this.raw = Object.freeze({ ...raw });
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
