/**
 * Validate an in-app redirect path (relative only, no open redirects).
 *
 * The control characters matter: the WHATWG URL parser strips tab, CR and LF
 * from its input before parsing, so `"/\t/evil.com"` starts with a single
 * slash here but resolves to `https://evil.com/` once it reaches `new URL()`.
 * Reject anything below U+0020 (plus DEL and backslash) rather than trying to
 * out-guess the parser.
 */
export function sanitizeReturnToPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\")) return null;
  for (const ch of trimmed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return null;
  }
  return trimmed;
}
