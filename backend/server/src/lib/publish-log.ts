/**
 * Structured logging for publish paths (replaces ad-hoc console.log).
 * Uses JSON lines so production log aggregators can parse consistently.
 * Accepts console-style variadic args for drop-in replacement.
 */

function write(level: "info" | "warn" | "error" | "debug", args: unknown[]) {
  const [first, ...rest] = args;
  const msg =
    typeof first === "string"
      ? first
      : first === undefined
        ? ""
        : (() => {
            try {
              return JSON.stringify(first);
            } catch {
              return String(first);
            }
          })();
  const entry = {
    level,
    msg,
    time: new Date().toISOString(),
    ...(rest.length > 0 ? { data: rest.length === 1 ? rest[0] : rest } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.log(line);
}

export const publishLog = {
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
  debug: (...args: unknown[]) => write("debug", args),
};
