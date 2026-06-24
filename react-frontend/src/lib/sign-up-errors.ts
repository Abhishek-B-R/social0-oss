export const EMAIL_ALREADY_EXISTS_MESSAGE =
  "An account with this email already exists. Try signing in with Google instead, or use the sign in tab.";

export const GENERIC_SIGN_UP_ERROR = "Something went wrong. Please try again.";

const EMAIL_EXISTS_PATTERNS = [
  /user_already_exists/i,
  /email_already_exists/i,
  /already exists/i,
  /already registered/i,
  /email taken/i,
  /duplicate/i,
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

/** Detect Better Auth / DB errors indicating the email is already registered. */
export function isEmailAlreadyExistsError(input: unknown): boolean {
  const strings = collectStrings(input);
  return strings.some(
    (s) =>
      EMAIL_EXISTS_PATTERNS.some((pattern) => pattern.test(s)) ||
      s.toUpperCase().includes("USER_ALREADY") ||
      s.toUpperCase().includes("EMAIL_ALREADY"),
  );
}

export function mapSignUpError(input: unknown): {
  error: string;
  code?: "EMAIL_ALREADY_EXISTS";
} {
  if (isEmailAlreadyExistsError(input)) {
    return { error: EMAIL_ALREADY_EXISTS_MESSAGE, code: "EMAIL_ALREADY_EXISTS" };
  }
  return { error: GENERIC_SIGN_UP_ERROR };
}

export async function mapSignUpErrorFromResponse(
  response: Response,
): Promise<{ error: string; code?: "EMAIL_ALREADY_EXISTS" }> {
  const payload = await response.json().catch(() => ({}));
  return mapSignUpError(payload);
}
