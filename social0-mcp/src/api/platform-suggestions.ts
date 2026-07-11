import type { Platform, PlatformSuggestion } from "../types/index.js";
import { SUPPORTED_PLATFORMS } from "../types/index.js";

const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  twitter_x: "X (Twitter)",
  threads: "Threads",
  bluesky: "Bluesky",
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasHashtags(text: string): boolean {
  return /#\w+/.test(text);
}

function hasUrls(text: string): boolean {
  return /https?:\/\//i.test(text);
}

export function suggestPlatforms(input: {
  content: string;
  hasMedia: boolean;
  mediaIsVideo?: boolean;
  connectedPlatforms?: Platform[];
}): PlatformSuggestion[] {
  const { content, hasMedia, mediaIsVideo } = input;
  const chars = content.length;
  const words = wordCount(content);
  const connected = new Set(input.connectedPlatforms ?? SUPPORTED_PLATFORMS);

  const suggestions: PlatformSuggestion[] = [];

  const add = (platform: Platform, recommended: boolean, reason: string) => {
    if (!connected.has(platform)) {
      suggestions.push({
        platform,
        recommended: false,
        reason: `${PLATFORM_LABELS[platform]} is not connected to your account`,
      });
      return;
    }
    suggestions.push({ platform, recommended, reason });
  };

  add(
    "linkedin",
    words >= 40 || chars >= 200,
    words >= 40
      ? "Long-form professional content performs well on LinkedIn"
      : "Short posts can work, but LinkedIn favors thoughtful updates",
  );

  add(
    "twitter_x",
    chars <= 280 || chars <= 500,
    chars <= 280
      ? "Concise posts fit X's format perfectly"
      : "Post may need trimming for X character limits",
  );

  add(
    "threads",
    chars <= 500,
    "Casual, conversational posts work well on Threads",
  );

  add(
    "bluesky",
    chars <= 300,
    "Short text updates are ideal for Bluesky",
  );

  add(
    "instagram",
    hasMedia && !mediaIsVideo,
    hasMedia
      ? "Visual content is core to Instagram"
      : "Instagram strongly prefers posts with images or carousels",
  );

  add(
    "tiktok",
    hasMedia && mediaIsVideo === true,
    hasMedia && mediaIsVideo
      ? "Short-form video is TikTok's primary format"
      : "TikTok requires video — text-only posts won't work",
  );

  add(
    "youtube",
    hasMedia && mediaIsVideo === true && words >= 10,
    hasMedia && mediaIsVideo
      ? "Video with a descriptive caption suits YouTube"
      : "YouTube needs video content",
  );

  add(
    "pinterest",
    hasMedia && !mediaIsVideo,
    hasMedia
      ? "Image pins with descriptive text perform well on Pinterest"
      : "Pinterest is image-first — attach media for best results",
  );

  add(
    "facebook",
    hasMedia || words >= 20,
    hasMedia
      ? "Facebook supports mixed media and longer captions"
      : "Text-only posts work but media boosts engagement",
  );

  if (hasHashtags(content)) {
    const ig = suggestions.find((s) => s.platform === "instagram");
    if (ig && ig.recommended) {
      ig.reason += "; hashtags help discovery";
    }
  }

  if (hasUrls(content)) {
    const li = suggestions.find((s) => s.platform === "linkedin");
    if (li) {
      li.recommended = true;
      li.reason = "LinkedIn handles link posts well for professional audiences";
    }
  }

  return suggestions.sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

export function formatPlatformSuggestions(suggestions: PlatformSuggestion[]): string {
  const lines = suggestions.map((s) => {
    const icon = s.recommended ? "✅" : "❌";
    const label = PLATFORM_LABELS[s.platform as Platform] ?? s.platform;
    return `${icon} ${label} — ${s.reason}`;
  });
  return lines.join("\n");
}
