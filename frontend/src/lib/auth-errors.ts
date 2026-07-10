export const EMAIL_ALREADY_EXISTS_MESSAGE =
  "An account with this email already exists. Try signing in with Google instead, or use the sign in tab.";

export const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";

export const RATE_LIMITED_MESSAGE =
  "Too many attempts. Please wait a few minutes and try again.";

const EMAIL_EXISTS_PATTERNS = [
  /user_already_exists/i,
  /email_already_exists/i,
  /USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL/i,
  /already exists/i,
  /already registered/i,
  /email taken/i,
  /duplicate/i,
  /unique constraint/i,
  /duplicate key/i,
];

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 5) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out, depth + 1);
    }
  }
  return out;
}

/** Pull the best user-facing message from API / Better Auth error shapes. */
export function extractErrorMessage(input: unknown): string {
  if (typeof input === "string") return input.trim();
  if (input instanceof Error) return input.message.trim();
  if (!input || typeof input !== "object") return "";

  const obj = input as Record<string, unknown>;

  if (typeof obj.error === "string") return obj.error.trim();
  if (obj.error && typeof obj.error === "object" && "message" in obj.error) {
    return String((obj.error as { message: unknown }).message).trim();
  }
  if (typeof obj.message === "string") return obj.message.trim();
  if (obj.body) {
    const fromBody = extractErrorMessage(obj.body);
    if (fromBody) return fromBody;
  }

  const strings = collectStrings(input).map((s) => s.trim()).filter(Boolean);
  return (
    strings.find(
      (s) =>
        s.length > 2 &&
        !s.startsWith("{") &&
        !s.startsWith("[") &&
        !/^https?:\/\//i.test(s),
    ) ?? ""
  );
}

export function isEmailAlreadyExistsError(input: unknown): boolean {
  if (input && typeof input === "object" && "code" in input) {
    const code = String((input as { code: unknown }).code);
    if (/USER_ALREADY|EMAIL_ALREADY/i.test(code)) return true;
  }
  const strings = collectStrings(input);
  return strings.some(
    (s) =>
      EMAIL_EXISTS_PATTERNS.some((pattern) => pattern.test(s)) ||
      s.toUpperCase().includes("USER_ALREADY") ||
      s.toUpperCase().includes("EMAIL_ALREADY"),
  );
}

/** Map auth errors to friendly copy, but keep real API messages when we have them. */
export function friendlyAuthError(err: unknown): string {
  if (err instanceof TypeError) {
    const lower = err.message.toLowerCase();
    if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
      return "Couldn't reach the server. Check your connection and try again.";
    }
  }

  const extracted = extractErrorMessage(err);
  const lower = extracted.toLowerCase();

  if (
    lower.includes("abort") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return "Request timed out. Please try again.";
  }

  if (
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("rate limiting")
  ) {
    return extracted || RATE_LIMITED_MESSAGE;
  }

  if (isEmailAlreadyExistsError(err) || isEmailAlreadyExistsError(extracted)) {
    return EMAIL_ALREADY_EXISTS_MESSAGE;
  }

  if (
    lower === "invalid email or password" ||
    lower.includes("invalid credentials") ||
    lower.includes("incorrect password")
  ) {
    return "Invalid email or password.";
  }

  if (extracted) return extracted;
  return GENERIC_AUTH_ERROR;
}

type ApiErrorPayload = {
  error?: string | { message?: string };
  message?: string;
  code?: string;
  retry?: boolean;
};

export async function parseApiErrorPayload(
  res: Response,
): Promise<ApiErrorPayload> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as ApiErrorPayload;
  } catch {
    return { error: text };
  }
}

/** Turn a failed auth API response into the toast message users should see. */
export async function messageForAuthResponse(res: Response): Promise<string> {
  const data = await parseApiErrorPayload(res);

  if (res.status === 409 || data.code === "EMAIL_ALREADY_EXISTS") {
    return EMAIL_ALREADY_EXISTS_MESSAGE;
  }
  if (data.code === "RATE_LIMITED" || res.status === 429) {
    return typeof data.error === "string" ? data.error : RATE_LIMITED_MESSAGE;
  }
  if (data.code === "SERVICE_UNAVAILABLE" || res.status === 503) {
    return typeof data.error === "string"
      ? data.error
      : "Service temporarily unavailable. Please try again later.";
  }
  if (data.code === "LEGAL_CONSENT_REQUIRED") {
    return typeof data.error === "string"
      ? data.error
      : "Please accept the Terms of Service and Privacy Policy.";
  }
  if (isEmailAlreadyExistsError(data)) {
    return EMAIL_ALREADY_EXISTS_MESSAGE;
  }

  return friendlyAuthError(data);
}
