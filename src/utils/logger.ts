type LogLevel = "INFO" | "WARN" | "ERROR";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const metaStr = meta ? " " + JSON.stringify(meta) : "";
  process.stderr.write(`[${ts}] [${level}] ${message}${metaStr}\n`);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("INFO", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("WARN", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("ERROR", message, meta),
};

/** Wraps a tool handler to log invocation, duration, and errors */
export function withLogging<T extends Record<string, unknown>, R>(
  toolName: string,
  handler: (args: T) => Promise<R>
): (args: T) => Promise<R> {
  return async (args: T): Promise<R> => {
    const start = Date.now();
    try {
      const result = await handler(args);
      logger.info(`Tool: ${toolName}`, { durationMs: Date.now() - start });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Tool: ${toolName} failed`, { durationMs: Date.now() - start, error: msg });
      throw err;
    }
  };
}
