import type { TikTokPostSettings } from "@/components/tiktok-post-settings";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import type { XPostSettings } from "@/components/XPostSettingsInline";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";

/** Post type, detected from what the person adds (no picker). */
export type ComposerContentType =
  | "text"
  | "image"
  | "video"
  | "threads"
  | "collection";

/** One image or video in the media tray (main post or a thread part). */
export type ComposerMedia = {
  /** Local id (stable across reorders). */
  id: string;
  kind: "image" | "video";
  /** Present until uploaded. */
  file?: File;
  /** Media row id once it exists on the server (edit / draft). */
  existingId?: string;
  /** blob: URL for local files, remote URL for existing media. */
  previewUrl: string;
  /** JPEG data URL for local videos (blob playback can be blocked). */
  posterUrl?: string;
  width?: number;
  height?: number;
  /** Seconds, videos only. 0 when unknown. */
  durationSec?: number;
  /**
   * Saved orientation of an existing video (`metadata.video.isVertical`),
   * used when width / height aren't known so a re-save keeps it.
   */
  isVertical?: boolean;
  mimeType?: string;
  sizeBytes?: number;
};

/** A post in a thread. Part 0 is the main caption + media. */
export type ComposerPart = {
  id: string;
  text: string;
  media: ComposerMedia[];
};

export type InstagramReelConfig = {
  coverImageUrl?: string;
  isTrialReel: boolean;
};

/** Everything the person edits. Serializable except `File`s. */
export type ComposerDraft = {
  parts: ComposerPart[];
  accountIds: string[];
  /** Caption overrides keyed by network id ("twitter_x"). Absent = main caption. */
  captionOverrides: Record<string, string>;
  /**
   * Per-account captions, keyed by account id. Only set when a saved post had
   * different captions for two accounts on the same network (the old Text
   * form stored one caption per account). Wins over `captionOverrides` for
   * those accounts so nothing is lost on save. Optional: older local
   * autosaves don't have it.
   */
  accountCaptions?: Record<string, string>;
  tiktok: Record<string, TikTokPostSettings>;
  /** TikTok photo posts: let TikTok add music (default on). */
  tiktokAutoAddMusic: boolean;
  pinterest: Record<string, PinterestPostSettings>;
  x: XPostSettings;
  youtubeTitle: string;
  instagram: InstagramReelConfig;
  autoRepost: AutoResurfaceConfig | null;
  autoPlug: AutoPlugConfig | null;
  /** Explicit time picked in the schedule popover (null = queue / now). */
  scheduledAt: string | null;
  /** Queue slot the picked time belongs to, when it came from the queue. */
  queueSlotId: string | null;
  /** Interpret typed times in this zone (defaults to the account timezone). */
  timezoneOverride: string | null;
  /** Kept when editing a post that was saved as a collection. */
  initialContentType: ComposerContentType | null;
};

/** How the composer was opened. */
export type ComposerMode =
  | { kind: "new" }
  | { kind: "draft"; postId: string }
  | { kind: "scheduled"; postId: string }
  /** Published post copied into a new one ("Edit and post again"). */
  | { kind: "edit"; postId: string };

/** A connected account, as the composer uses it. */
export type ComposerAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
  isTwitterPremium: boolean;
  tokenExpired: boolean;
  platformMetadata?: Record<string, unknown>;
  connectionMethod?: string | null;
};

/** A problem that blocks some or all accounts. */
export type ComposerIssue = {
  id: string;
  message: string;
  /**
   * Accounts this issue blocks. Empty = blocks the whole post (no
   * "post to the rest" path).
   */
  accountIds: string[];
  network?: string;
  /** What fixes it, rendered as a button in the issues list. */
  fix?: ComposerFix;
};

export type ComposerFix =
  | { kind: "open-setting"; setting: SettingKey; label: string }
  | { kind: "add-media"; label: string }
  | { kind: "deselect"; label: string }
  | { kind: "reconnect"; href: string; label: string }
  | { kind: "schedule"; label: string }
  | { kind: "upgrade"; label: string };

/** Non-blocking notes (trimming, first-4-media, ratio guidance). */
export type ComposerWarning = {
  id: string;
  message: string;
  network?: string;
  tone?: "warning" | "info";
  /** Optional one-click fix. */
  action?: { label: string; run: () => void };
};

export type SettingKey =
  | "tiktok"
  | "x"
  | "pinterest"
  | "youtube"
  | "instagram"
  | "autoplug"
  | "autorepost";

/** What the submit buttons do. */
export type SubmitAction = "queue" | "schedule" | "now" | "draft";
