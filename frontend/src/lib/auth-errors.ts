export const EMAIL_ALREADY_EXISTS_MESSAGE =
  "An account with this email already exists. Try signing in with Google instead, or use the sign in tab.";

export const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";

export const RATE_LIMITED_MESSAGE =
  "Too many attempts. Please wait a few minutes and try again.";

export const EMAIL_NOT_VERIFIED_MESSAGE =
  "Please verify your email first. Check your inbox for the 6-digit code, or request a new one on the verify page.";

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

const EMAIL_NOT_VERIFIED_PATTERNS = [
  /email not verified/i,
  /EMAIL_NOT_VERIFIED/i,
  /verify your email/i,
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

function errorCode(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  if (typeof obj.code === "string") return obj.code.trim();
  if (obj.error && typeof obj.error === "object" && "code" in obj.error) {
    return String((obj.error as { code: unknown }).code).trim();
  }
  return "";
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
  const code = errorCode(input);
  if (/USER_ALREADY|EMAIL_ALREADY/i.test(code)) return true;
  const strings = collectStrings(input);
  return strings.some(
    (s) =>
      EMAIL_EXISTS_PATTERNS.some((pattern) => pattern.test(s)) ||
      s.toUpperCase().includes("USER_ALREADY") ||
      s.toUpperCase().includes("EMAIL_ALREADY"),
  );
}

export function isEmailNotVerifiedError(input: unknown): boolean {
  const code = errorCode(input);
  if (code === "EMAIL_NOT_VERIFIED") return true;
  const strings = collectStrings(input);
  return strings.some((s) =>
    EMAIL_NOT_VERIFIED_PATTERNS.some((pattern) => pattern.test(s)),
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
  const code = errorCode(err);

  if (
    lower.includes("abort") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return "Request timed out. Please try again.";
  }

  if (
    code === "RATE_LIMITED" ||
    code === "TOO_MANY_REQUESTS" ||
    code === "TOO_MANY_ATTEMPTS" ||
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("rate limiting") ||
    lower.includes("too many attempts")
  ) {
    return extracted || RATE_LIMITED_MESSAGE;
  }

  if (isEmailAlreadyExistsError(err) || isEmailAlreadyExistsError(extracted)) {
    return EMAIL_ALREADY_EXISTS_MESSAGE;
  }

  if (isEmailNotVerifiedError(err) || isEmailNotVerifiedError(extracted)) {
    return EMAIL_NOT_VERIFIED_MESSAGE;
  }

  if (
    lower === "invalid email or password" ||
    lower.includes("invalid credentials") ||
    lower.includes("incorrect password")
  ) {
    return "Invalid email or password.";
  }

  if (
    lower.includes("invalid otp") ||
    lower.includes("otp expired") ||
    lower.includes("otp is invalid") ||
    code === "INVALID_OTP"
  ) {
    return "Invalid or expired code. Request a new one and try again.";
  }

  if (code === "turnstile_failed") {
    return "Verification failed. Please refresh and try again.";
  }

  if (
    code === "state_mismatch" ||
    code === "state_not_found" ||
    code === "state_invalid"
  ) {
    return "Google sign-in was interrupted. Allow cookies for social0.app, disable strict blockers, and try again.";
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
  if (
    data.code === "RATE_LIMITED" ||
    data.code === "TOO_MANY_ATTEMPTS" ||
    res.status === 429
  ) {
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
