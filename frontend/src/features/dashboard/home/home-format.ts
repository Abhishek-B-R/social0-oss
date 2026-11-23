import { formatInTimeZone } from "date-fns-tz";
import type {
  HomePost,
  HomePublication,
  PostSourceDto,
  PublicationErrorKind,
} from "@/api/dashboard";
import { getPostSourceFromDto, networkLabel, type PostSourceInfo } from "@/components/app";

/** Resolve the backend's `PostSourceDto` into the kit's chip info. */
export function sourceInfo(source: PostSourceDto | null | undefined): PostSourceInfo {
  return getPostSourceFromDto(source);
}

/** Safe tz formatting: an unknown zone falls back to the browser zone. */
export function formatTz(iso: string | Date, timezone: string, pattern: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  try {
    return formatInTimeZone(d, timezone, pattern);
  } catch {
    return formatInTimeZone(d, Intl.DateTimeFormat().resolvedOptions().timeZone, pattern);
  }
}

/** date-fns pattern for a clock time, following the user's 12/24-hour setting. */
export function timePattern(use24h: boolean | undefined): string {
  return use24h ? "HH:mm" : "h:mm a";
}

/** yyyy-MM-dd of an instant in `timezone`. */
export function dayKey(iso: string | Date, timezone: string): string {
  return formatTz(iso, timezone, "yyyy-MM-dd");
}

/**
 * Short time for lists: "9:00 AM" (or "09:00") today, "Mon 9:00 AM" this
 * week, "12 Oct" otherwise.
 */
export function shortWhen(
  iso: string,
  timezone: string,
  today: string,
  use24h: boolean | undefined,
  now = new Date(),
): string {
  const time = timePattern(use24h);
  const key = dayKey(iso, timezone);
  if (key === today) return formatTz(iso, timezone, time);
  const d = new Date(iso);
  const ageMs = Math.abs(now.getTime() - d.getTime());
  if (ageMs < 6 * 24 * 60 * 60 * 1000) return formatTz(iso, timezone, `EEE ${time}`);
  return formatTz(iso, timezone, "d MMM");
}

/** "Launch thread: CLI v2" or a fallback for media-only posts. */
export function postTitle(snippet: string | null | undefined): string {
  const s = snippet?.trim();
  return s ? s : "Untitled post (media only)";
}

/** "Pinterest", "Pinterest and TikTok", "Pinterest, TikTok and X". */
export function joinNetworks(platforms: string[]): string {
  const names = [...new Set(platforms)].map(networkLabel);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const KIND_PRIORITY: PublicationErrorKind[] = [
  "reconnect",
  "interrupted",
  "plan",
  "content",
  "transient",
];

/**
 * A failed publication's fix, given what we know about its account now.
 * `errorKind` comes from the failure text, so an auth failure stays
 * "reconnect" forever; once the account is healthy again (reconnected, or a
 * later delivery went out) the fix is a retry. `isAccountBroken` answers that;
 * without it the stored kind is used as is.
 */
export function publicationErrorKind(
  pub: HomePublication,
  isAccountBroken?: (accountId: string) => boolean,
): PublicationErrorKind | null {
  if (
    pub.errorKind === "reconnect" &&
    isAccountBroken &&
    pub.connectedAccountId &&
    !isAccountBroken(pub.connectedAccountId)
  ) {
    return "transient";
  }
  return pub.errorKind;
}

/** The one fix a failed post needs most (reconnect beats plan beats content beats retry). */
export function primaryErrorKind(
  post: HomePost,
  isAccountBroken?: (accountId: string) => boolean,
): PublicationErrorKind {
  const kinds = new Set<PublicationErrorKind>();
  for (const p of post.publications) {
    if (p.status !== "failed") continue;
    const kind = publicationErrorKind(p, isAccountBroken);
    if (kind) kinds.add(kind);
  }
  if (kinds.size === 0 && post.failureKind) return post.failureKind;
  for (const k of KIND_PRIORITY) if (kinds.has(k)) return k;
  return "transient";
}

export function failedPublications(post: HomePost): HomePublication[] {
  return post.publications.filter((p) => p.status === "failed");
}

/** Trim a raw platform error into one readable sentence. */
export function plainError(raw: string | null | undefined, max = 140): string | null {
  if (!raw) return null;
  let s = raw.replace(/\s+/g, " ").trim();
  // Drop JSON blobs some platforms return after the message.
  const brace = s.indexOf("{");
  if (brace > 20) s = s.slice(0, brace).trim();
  s = s.replace(/^error:\s*/i, "");
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** What went wrong, in the user's words, when the platform text is missing or opaque. */
export function errorKindCopy(kind: PublicationErrorKind): string {
  switch (kind) {
    case "reconnect":
      return "the account's sign-in expired";
    case "plan":
      return "your plan doesn't allow this post";
    case "content":
      return "the network rejected the post";
    case "interrupted":
      return "publishing stopped before the network confirmed, so it may already be live";
    default:
      return "the network didn't respond";
  }
}
