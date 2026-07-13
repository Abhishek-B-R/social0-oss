let verboseEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

export function isVerbose(): boolean {
  return verboseEnabled || process.env.SOCIAL0_VERBOSE === "1";
}

/** Strip query strings — presigned URLs embed bearer-like signatures. */
export function redactUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.search) return `${parsed.origin}${parsed.pathname}`;
    return `${parsed.origin}${parsed.pathname}?[redacted]`;
  } catch {
    const q = url.indexOf("?");
    return q >= 0 ? `${url.slice(0, q)}?[redacted]` : url;
  }
}

export function logVerbose(message: string, data?: Record<string, unknown>): void {
  if (!isVerbose()) return;
  const ts = new Date().toISOString();
  if (data) {
    console.error(`[${ts}] ${message}`, JSON.stringify(data));
  } else {
    console.error(`[${ts}] ${message}`);
  }
}

export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
