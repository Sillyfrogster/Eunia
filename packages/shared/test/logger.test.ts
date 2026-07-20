import { afterEach, describe, expect, test } from "bun:test";
import {
  ConsoleLogger,
  SilentLogger,
  createLogger,
  formatLogPrefix,
  type LogLevel,
} from "../src/logger";

type WrittenLine = {
  level: Exclude<LogLevel, "silent">;
  scope: string;
  values: unknown[];
};

function capture(): { lines: WrittenLine[]; write: ConsoleLoggerWrite } {
  const lines: WrittenLine[] = [];
  return {
    lines,
    write: (level, scope, values) => {
      lines.push({ level, scope, values });
    },
  };
}

type ConsoleLoggerWrite = NonNullable<
  ConstructorParameters<typeof ConsoleLogger>[0]
>["write"] & {};

describe("ConsoleLogger", () => {
  test("filters messages below the configured level", () => {
    const { lines, write } = capture();
    const logger = new ConsoleLogger({ level: "warn", write });

    logger.debug("nope");
    logger.info("nope");
    logger.warn("careful");
    logger.error("broken");

    expect(lines.map((line) => line.level)).toEqual(["warn", "error"]);
  });

  test("child loggers extend the scope and keep the sink", () => {
    const { lines, write } = capture();
    const logger = new ConsoleLogger({ level: "info", scope: "eunia", write });

    logger.child("gateway").child("shard-0").info("ready");

    expect(lines).toEqual([
      { level: "info", scope: "eunia:gateway:shard-0", values: ["ready"] },
    ]);
  });
});

describe("createLogger", () => {
  const original = process.env["EUNIA_LOG"];
  const written: string[] = [];
  const realWrite = process.stderr.write;

  afterEach(() => {
    if (original === undefined) delete process.env["EUNIA_LOG"];
    else process.env["EUNIA_LOG"] = original;
    process.stderr.write = realWrite;
    written.length = 0;
  });

  const captureStderr = (): void => {
    process.stderr.write = ((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
  };

  test("stays silent when EUNIA_LOG is unset", () => {
    delete process.env["EUNIA_LOG"];
    captureStderr();

    createLogger("gateway").error("should not appear");

    expect(written).toHaveLength(0);
  });

  test("writes one line when EUNIA_LOG enables a level", () => {
    process.env["EUNIA_LOG"] = "info";
    captureStderr();

    createLogger("gateway").info("shown", { detail: 7 });

    expect(written).toHaveLength(1);
    expect(written[0]).toContain("INFO");
    expect(written[0]).toContain("gateway");
    expect(written[0]).toContain("shown");
    expect(written[0]?.endsWith("\n")).toBe(true);
  });
});

describe("formatLogPrefix", () => {
  const at = new Date(2026, 0, 1, 14, 3, 22, 123);

  test("renders a plain aligned prefix without colors", () => {
    expect(formatLogPrefix("info", "eunia:rest", { colors: false, at })).toBe(
      "14:03:22.123 INFO  eunia:rest",
    );
    expect(formatLogPrefix("error", "eunia", { colors: false, at })).toBe(
      "14:03:22.123 ERROR eunia",
    );
  });

  test("wraps the prefix in ANSI colors when enabled", () => {
    const prefix = formatLogPrefix("warn", "eunia:gateway", { colors: true, at });

    expect(prefix).toContain("\x1b[33m");
    expect(prefix).toContain("WARN");
    expect(prefix).toContain("eunia:gateway");
    expect(prefix.endsWith("\x1b[0m")).toBe(true);
  });
});

describe("SilentLogger", () => {
  test("drops everything and returns itself for children", () => {
    const logger = new SilentLogger();
    expect(logger.child("anything")).toBe(logger);
  });
});
