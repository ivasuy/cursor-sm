type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL: LogLevel = "info";

function resolveLogLevel(value: string | undefined): LogLevel {
  if (!value) return DEFAULT_LEVEL;
  const normalized = value.toLowerCase();
  return normalized in LOG_LEVELS
    ? (normalized as LogLevel)
    : DEFAULT_LEVEL;
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function normalizeMeta(meta?: Record<string, unknown>) {
  if (!meta) return undefined;

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      value instanceof Error ? serializeError(value) : value,
    ])
  );
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

class StructuredLogger implements Logger {
  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write("error", message, meta);
  }

  child(bindings: Record<string, unknown>): Logger {
    return new StructuredLogger({ ...this.bindings, ...bindings });
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const configuredLevel = resolveLogLevel(process.env.LOG_LEVEL);
    if (LOG_LEVELS[level] < LOG_LEVELS[configuredLevel]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...normalizeMeta(meta),
    };

    const serialized = JSON.stringify(payload);
    if (level === "error") {
      console.error(serialized);
      return;
    }
    if (level === "warn") {
      console.warn(serialized);
      return;
    }
    console.log(serialized);
  }
}

export const logger: Logger = new StructuredLogger({
  service: "backend",
});
