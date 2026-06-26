/**
 * Shared X/Twitter API error parsing for tweet posts and media uploads.
 * twitter-api-v2 often throws Error("Request failed with code 403") while the
 * useful detail lives on .data or .response.data - we surface that first.
 */

const TWITTER_403_DUPLICATE_HINT =
  " This may happen if this tweet was already published-X won't post the exact same content twice.";

/** Extract a readable error from Twitter/X API response (v2 problem+json, v1 errors[], etc.) */
export function parseTwitterError(
  data: Record<string, unknown>,
  fallbackStatus: number,
): string {
  const title = data.title as string | undefined;
  const detail = data.detail as string | undefined;
  const message = data.message as string | undefined;
  const errors = data.errors as
    | Array<{ message?: string; code?: number }>
    | undefined;
  const error = data.error as string | undefined;
  const parts: string[] = [];
  if (title) parts.push(title);
  if (detail && detail !== title) parts.push(detail);
  if (message && message !== title && message !== detail) parts.push(message);
  if (error && error !== title) parts.push(error);
  if (errors && errors.length > 0) {
    const errorMessages = errors
      .map((err) => err.message || `Error ${err.code ?? ""}`)
      .join(", ");
    parts.push(errorMessages);
  }
  if (parts.length) return parts.join(" - ");
  return `Twitter API error: ${fallbackStatus}`;
}

function collectTwitterErrorPayload(
  e: unknown,
): Record<string, unknown> | null {
  if (!e || typeof e !== "object") return null;
  const o = e as Record<string, unknown>;
  if (o.data && typeof o.data === "object" && !Array.isArray(o.data)) {
    return o.data as Record<string, unknown>;
  }
  const resp = o.response as { data?: unknown } | undefined;
  if (
    resp?.data &&
    typeof resp.data === "object" &&
    !Array.isArray(resp.data)
  ) {
    return resp.data as Record<string, unknown>;
  }
  if (Array.isArray(o.errors) && o.errors.length) {
    return { errors: o.errors };
  }
  return null;
}

function parseHttpStatusFromMessage(message: string): number | undefined {
  const codeMatch =
    message.match(/(?:code|HTTP)\s*(\d{3})\b/i) ??
    message.match(/\b(4\d{2}|5\d{2})\b/);
  if (codeMatch) {
    const n = parseInt(codeMatch[1], 10);
    if (n >= 400 && n < 600) return n;
  }
  return undefined;
}

function extractHttpStatus(e: unknown): number | undefined {
  if (!e || typeof e !== "object") {
    return undefined;
  }
  const o = e as Record<string, unknown>;
  if (typeof o.code === "number" && o.code >= 100 && o.code < 600)
    return o.code;
  if (typeof o.status === "number") return o.status;
  const r = o.response as { status?: number } | undefined;
  if (r?.status) return r.status;
  return undefined;
}

function isGenericSdkMessage(msg: string): boolean {
  return msg === "Request failed." || msg === "Request failed";
}

function appendTwitter403DuplicateHint(
  message: string,
  httpStatus: number | undefined,
): string {
  const is403 =
    httpStatus === 403 ||
    /\b403\b/.test(message) ||
    /code\s*403/i.test(message);
  if (!is403) return message;
  if (
    /duplicate|already\s+(been\s+)?sent|same\s+content|status\s*187|\b187\b|forbidden/i.test(
      message,
    )
  ) {
    return message;
  }
  return message.endsWith(".")
    ? `${message}${TWITTER_403_DUPLICATE_HINT}`
    : `${message}.${TWITTER_403_DUPLICATE_HINT}`;
}

function logGenericRequestFailed(e: unknown): void {
  try {
    const safeKeys = ["code", "status", "cause", "data", "response"];
    const hint: Record<string, unknown> = {};
    if (e && typeof e === "object") {
      const o = e as Record<string, unknown>;
      for (const k of safeKeys) {
        if (k in o && o[k] !== undefined) {
          if (
            typeof o[k] === "object" &&
            o[k] !== null &&
            "data" in (o[k] as object)
          )
            hint[k] = "(has data)";
          else if (
            typeof o[k] === "object" &&
            o[k] !== null &&
            "status" in (o[k] as object)
          )
            hint[k] = { ...(o[k] as object), data: "(omitted)" };
          else hint[k] = o[k];
        }
      }
    }
    console.error(
      "[Twitter] Generic Request failed - error hint:",
      JSON.stringify(hint),
    );
  } catch {
    console.error("[Twitter] Generic Request failed - raw error:", e);
  }
}

/**
 * Best human-readable message from a thrown Twitter SDK/API error.
 * @param fallbackUserMessage - e.g. "Failed to post tweet" or "Unknown error" for media.
 */
export function extractTwitterApiErrorMessage(
  e: unknown,
  fallbackUserMessage: string,
): string {
  const data = collectTwitterErrorPayload(e);
  let httpStatus = extractHttpStatus(e);
  if (e instanceof Error && !httpStatus) {
    httpStatus = parseHttpStatusFromMessage(e.message);
  }

  let best: string | null = null;

  if (data) {
    const fb =
      httpStatus ??
      (typeof data.status === "number" ? (data.status as number) : 0);
    const parsed = parseTwitterError(data, fb);
    const generic =
      parsed === `Twitter API error: ${fb}` ||
      (fb === 0 && parsed === "Twitter API error: 0");
    if (!generic) {
      best = parsed;
    }
  }

  if (!best && e instanceof Error) {
    const msg = e.message;
    if (!isGenericSdkMessage(msg)) {
      best = msg;
      if (!httpStatus) httpStatus = parseHttpStatusFromMessage(msg);
    }
  }

  if (!best && e && typeof e === "object") {
    const err = e as Record<string, unknown>;
    if (err.cause instanceof Error && err.cause.message) {
      best = err.cause.message;
      if (!httpStatus) httpStatus = parseHttpStatusFromMessage(best);
    } else if (typeof err.error === "string" && err.error) {
      best = err.error;
      if (!httpStatus) httpStatus = parseHttpStatusFromMessage(best);
    }
  }

  if (!best) {
    if (e instanceof Error && isGenericSdkMessage(e.message)) {
      logGenericRequestFailed(e);
    }
    best = e instanceof Error ? e.message : fallbackUserMessage;
    if (best === "Request failed." || best === "Request failed") {
      best = fallbackUserMessage;
    }
  }

  if (!httpStatus) httpStatus = parseHttpStatusFromMessage(best);

  return appendTwitter403DuplicateHint(best, httpStatus);
}

/** Best message for tweet create/update failures (publish flow). */
export function getTwitterErrorMessage(e: unknown): string {
  return extractTwitterApiErrorMessage(e, "Failed to post tweet");
}

/**
 * Media upload errors: prefix with context (e.g. "Twitter image upload").
 */
export function formatTwitterMediaError(e: unknown, context: string): string {
  const inner = extractTwitterApiErrorMessage(e, "Unknown error");
  if (inner.startsWith(`${context}:`)) return inner;
  return `${context}: ${inner}`;
}

/** Matches `connectedAccounts.platform` for X/Twitter in this app. */
export function isTwitterPlatformId(
  platform: string | null | undefined,
): boolean {
  if (!platform) return false;
  const p = platform.toLowerCase();
  return p === "twitter" || p === "twitter_x" || p === "x";
}

/**
 * Enrich a persisted error for UI (post detail, lists). The DB often stores raw
 * SDK strings like "Request failed with code 403" without publish-time formatting.
 */
export function enrichTwitterErrorForDisplay(message: string): string {
  if (
    /maxFileSizeExceeded|File size exceeds/i.test(message) ||
    /maxFileSize(?:Bytes|Byes)/i.test(message)
  ) {
    const bytesMatch = message.match(
      /(?:maxFileSize(?:Bytes|Byes)|exceeds)\D*(\d{5,})/i,
    );
    const bytes = bytesMatch ? parseInt(bytesMatch[1], 10) : 5_242_880;
    const mb = (bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1);
    return `Image is too large for X (maximum ${mb} MB). Use a smaller or compressed image and try again.`;
  }

  const httpStatus = parseHttpStatusFromMessage(message);
  return appendTwitter403DuplicateHint(message, httpStatus);
}
