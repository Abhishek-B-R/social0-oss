/** Map raw API/RPC errors to stable user-facing messages. */
export function toClientErrorMessage(
  raw: string | undefined,
  fallback: string,
): string {
  if (!raw?.trim()) return fallback;
  const text = raw.trim();

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === "string" && parsed.error.length < 200) {
        return parsed.error;
      }
      if (typeof parsed.message === "string" && parsed.message.length < 200) {
        return parsed.message;
      }
    } catch {
      // fall through
    }
  }

  if (text.length > 200) return fallback;
  if (/stack|trace|sql|drizzle|postgres|internal server/i.test(text)) {
    return fallback;
  }
  return text;
}
