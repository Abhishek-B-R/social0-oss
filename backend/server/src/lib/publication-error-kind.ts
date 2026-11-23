import { isPlatformAuthError } from "./platform-auth-errors.js";
import { INTERRUPTED_PUBLISH_ERROR, NEVER_EXPIRES_PLATFORMS } from "@social0/shared";

/**
 * What the user should do about a failed publication. One mapping for every
 * surface (Home "Needs attention", post detail Deliveries, Posts row action),
 * so the same failure never gets a Reconnect button in one place and Retry in
 * another.
 *
 * - `reconnect`: the account's token is dead or short a permission.
 * - `content`: the post itself was rejected (length, media, format). Edit it.
 * - `plan`: blocked by billing / plan limits. Upgrade or fix payment.
 * - `interrupted`: the run stopped before the platform answered, so the post
 *   may already be live. Check the platform before retrying.
 * - `transient`: anything else (timeouts, 5xx, rate limits). Retry.
 */
export type PublicationErrorKind =
  | "reconnect"
  | "content"
  | "transient"
  | "plan"
  | "interrupted";

const PLAN_RE =
  /payment required|free posts?\b|upgrade (?:to|your plan)|plan limit|subscription (?:is )?(?:inactive|expired|required)|requires? (?:a )?(?:paid|creator|agency|pro|growth|starter|max) plan|pro subscription is inactive/i;

/** Unambiguous account problems: these win over anything content-like. */
const RECONNECT_RE =
  /re-?authori[sz]e|missing (?:required )?(?:scopes?|permissions?)|needs updated permissions|access (?:was |has been )?revoked|app password missing|missing access secret|session expired|token expired|account (?:is )?disconnected/i;

/** Copy that suggests reconnecting among other fixes (checked after content). */
const RECONNECT_HINT_RE = /reconnect|re-?auth\b/i;

const CONTENT_RE =
  /\b(?:media|video|image|photo|carousel|thumbnail|cover)\b.*\b(?:too|invalid|unsupported|exceeds?|must|max|not supported)\b|aspect ratio|duration|too long|too short|too large|too small|characters? or less|over \d+ characters|\bcharacters\b.*\b(?:limit|max)|file size|file type|unsupported (?:file|format|media|codec)|codec|resolution|content is empty|post content is empty|requires at least one (?:image|video)|at most \d+ (?:images|photos|items)|duplicate|already (?:been )?(?:posted|published)|same content twice|content policy|violat|spam|caption|\btitle\b.*\b(?:required|too long|invalid)|\bboard\b.*\b(?:required|not found|invalid)/i;

/**
 * Classify a publication (or post-level) failure.
 *
 * Returns null when there is no failure to classify. `tokenStatus` is the
 * connected account's stored `token_status`: an account the health sweep has
 * already marked expired is a reconnect whatever the platform said. Pass the
 * account's `platform` with it: a stale `expired` on a never-expiring platform
 * is ignored, the same as the Accounts page and sidebar health
 * (`getTokenStatus`), so a row they show as healthy never gets "Reconnect".
 */
export function classifyPublicationError(input: {
  error: string | null | undefined;
  status?: string | null;
  tokenStatus?: string | null;
  platform?: string | null;
}): PublicationErrorKind | null {
  const message = (input.error ?? "").trim();
  const failed = input.status == null || input.status === "failed";
  if (!failed) return null;
  if (!message && input.status !== "failed") return null;

  // Exact marker written by the publish engine: never "temporary, retry".
  if (message === INTERRUPTED_PUBLISH_ERROR) return "interrupted";
  if (PLAN_RE.test(message)) return "plan";
  if (
    input.tokenStatus === "expired" &&
    !(input.platform && NEVER_EXPIRES_PLATFORMS.has(input.platform))
  ) {
    return "reconnect";
  }
  if (message && isPlatformAuthError(message)) return "reconnect";
  if (RECONNECT_RE.test(message)) return "reconnect";
  if (CONTENT_RE.test(message)) return "content";
  if (RECONNECT_HINT_RE.test(message)) return "reconnect";
  return "transient";
}
