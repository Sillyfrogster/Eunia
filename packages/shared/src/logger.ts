export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(...values: unknown[]): void;
  info(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
  child(scope: string): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  scope?: string;
  write?: (level: Exclude<LogLevel, "silent">, scope: string, values: unknown[]) => void;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";

const LEVEL_LABELS: Record<Exclude<LogLevel, "silent">, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

const LEVEL_COLORS: Record<Exclude<LogLevel, "silent">, string> = {
  debug: "\x1b[90m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

/** Writes timestamped diagnostics to stderr. */
export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly scope: string;
  private readonly write: NonNullable<LoggerOptions["write"]>;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.scope = options.scope ?? "eunia";
    this.write = options.write ?? defaultWrite;
  }

  debug(...values: unknown[]): void {
    this.log("debug", values);
  }

  info(...values: unknown[]): void {
    this.log("info", values);
  }

  warn(...values: unknown[]): void {
    this.log("warn", values);
  }

  error(...values: unknown[]): void {
    this.log("error", values);
  }

  child(scope: string): Logger {
    return new ConsoleLogger({
      level: this.level,
      scope: `${this.scope}:${scope}`,
      write: this.write,
    });
  }

  private log(level: Exclude<LogLevel, "silent">, values: unknown[]): void {
    if (LEVELS[level] < LEVELS[this.level]) return;
    this.write(level, this.scope, values);
  }
}

/** Drops every diagnostic message. */
export class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(_scope: string): Logger {
    return this;
  }
}

/** Reads EUNIA_LOG for the level; unset or invalid means silent. */
export function createLogger(scope: string): Logger {
  const configured = process.env["EUNIA_LOG"];
  const level = configured && configured in LEVELS ? (configured as LogLevel) : "silent";
  if (level === "silent") return new SilentLogger();
  return new ConsoleLogger({ level, scope });
}

/** Renders the "time LEVEL scope" prefix for one log line. */
export function formatLogPrefix(
  level: Exclude<LogLevel, "silent">,
  scope: string,
  options: { colors: boolean; at?: Date },
): string {
  const time = formatTime(options.at ?? new Date());
  const label = LEVEL_LABELS[level];
  if (!options.colors) return `${time} ${label} ${scope}`;
  return `${DIM}${time}${RESET} ${LEVEL_COLORS[level]}${label}${RESET} ${CYAN}${scope}${RESET}`;
}

function formatTime(date: Date): string {
  const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${time}.${pad(date.getMilliseconds(), 3)}`;
}

function stderrColorsEnabled(): boolean {
  if (process.env["NO_COLOR"] !== undefined) return false;
  if (process.env["FORCE_COLOR"] !== undefined) return true;
  return process.stderr.isTTY === true;
}

// console.error is avoided: Bun wraps it in its own red ANSI styling on TTYs.
function defaultWrite(
  level: Exclude<LogLevel, "silent">,
  scope: string,
  values: unknown[],
): void {
  const colors = stderrColorsEnabled();
  const parts = [
    formatLogPrefix(level, scope, { colors }),
    ...values.map((value) =>
      typeof value === "string" ? value : Bun.inspect(value, { colors }),
    ),
  ];
  process.stderr.write(`${parts.join(" ")}\n`);
}
