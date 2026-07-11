import {
  formLabel,
  platformsForForm,
  type PostForm,
} from "../lib/content-types.js";
import type { Platform, PlatformSuggestion } from "../types/index.js";
import { SUPPORTED_PLATFORMS } from "../types/index.js";
import { inferPostForm } from "../utils/post-form.js";

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

const FORM_PRIORITY: Record<PostForm, Platform[]> = {
  video: [
    "youtube",
    "tiktok",
    "instagram",
    "linkedin",
    "facebook",
    "twitter_x",
    "threads",
    "bluesky",
    "pinterest",
  ],
  image: [
    "instagram",
    "pinterest",
    "facebook",
    "linkedin",
    "twitter_x",
    "threads",
    "bluesky",
    "tiktok",
    "youtube",
  ],
  text: [
    "linkedin",
    "twitter_x",
    "threads",
    "bluesky",
    "facebook",
    "instagram",
    "youtube",
    "pinterest",
    "tiktok",
  ],
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasUrls(text: string): boolean {
  return /https?:\/\//i.test(text);
}

export function inferPostFormForSuggestion(input: {
  hasMedia?: boolean;
  mediaIsVideo?: boolean;
  mediaType?: "none" | "image" | "video";
}): PostForm {
  return inferPostForm({
    ...(input.hasMedia !== undefined ? { hasMedia: input.hasMedia } : {}),
    ...(input.mediaIsVideo !== undefined ? { mediaIsVideo: input.mediaIsVideo } : {}),
    ...(input.mediaType !== undefined ? { mediaType: input.mediaType } : {}),
  });
}

function scorePlatform(
  platform: Platform,
  form: PostForm,
  content: string,
): { recommended: boolean; reason: string } {
  const chars = content.length;
  const words = wordCount(content);
  const hasLink = hasUrls(content);

  if (form === "video") {
    if (platform === "youtube") {
      return { recommended: true, reason: "Strong fit for Shorts or video uploads" };
    }
    if (platform === "tiktok") {
      return { recommended: true, reason: "Strong fit for short-form video" };
    }
    if (platform === "instagram") {
      return { recommended: true, reason: "Strong fit for Reels and video posts" };
    }
    if (platform === "linkedin" || platform === "facebook") {
      return {
        recommended: true,
        reason:
          platform === "linkedin"
            ? "Works for professional video updates"
            : "Works for audience updates with native video",
      };
    }
    if (platform === "twitter_x" || platform === "threads" || platform === "bluesky") {
      return {
        recommended: words <= 80,
        reason:
          words <= 80
            ? "Works when paired with a short caption"
            : "Compatible, but shorten the caption for better feed performance",
      };
    }
    return { recommended: true, reason: "Compatible with video posts in Social0" };
  }

  if (form === "image") {
    if (platform === "instagram" || platform === "pinterest") {
      return { recommended: true, reason: "Strong fit for visual-first image posts" };
    }
    if (platform === "linkedin") {
      return {
        recommended: hasLink || words >= 12,
        reason: hasLink || words >= 12
          ? "Image plus context works well for professional audiences"
          : "Compatible, but add context for better LinkedIn results",
      };
    }
    if (platform === "facebook") {
      return { recommended: true, reason: "Image posts work well for broad audience updates" };
    }
    if (platform === "tiktok") {
      return {
        recommended: true,
        reason: "Compatible for photo posts, but video usually performs better",
      };
    }
    return { recommended: true, reason: "Supports image posts in Social0" };
  }

  // text
  switch (platform) {
    case "linkedin":
      return {
        recommended: hasLink || words >= 15,
        reason: hasLink
          ? "Link posts work well for professional audiences"
          : words >= 15
            ? "Longer text suits LinkedIn"
            : "Works, but LinkedIn favors substantive updates",
      };
    case "twitter_x":
      return {
        recommended: chars <= 280,
        reason:
          chars <= 280
            ? "Fits X character limit"
            : `~${chars} chars — may need trimming or a thread`,
      };
    case "threads":
      return {
        recommended: chars <= 500,
        reason: "Casual conversational text",
      };
    case "bluesky":
      return {
        recommended: chars <= 300,
        reason:
          chars <= 300 ? "Short updates fit Bluesky" : "Consider shortening for Bluesky",
      };
    case "facebook":
      return { recommended: true, reason: "Text and link posts supported" };
    default:
      return {
        recommended: false,
        reason: `Text-only not supported — use image or video post type`,
      };
  }
}

export function suggestPlatforms(input: {
  content: string;
  hasMedia?: boolean;
  mediaIsVideo?: boolean;
  mediaType?: "none" | "image" | "video";
  connectedPlatforms?: Platform[];
}): PlatformSuggestion[] {
  const form = inferPostFormForSuggestion(input);
  const supported = new Set(platformsForForm(form));
  const connected = new Set(input.connectedPlatforms ?? SUPPORTED_PLATFORMS);

  const suggestions: PlatformSuggestion[] = [];

  for (const platform of SUPPORTED_PLATFORMS) {
    const label = PLATFORM_LABELS[platform];

    if (!connected.has(platform)) {
      suggestions.push({
        platform,
        recommended: false,
        reason: `${label} is not connected — connect at social0.app/dashboard/connections`,
      });
      continue;
    }

    if (!supported.has(platform)) {
      suggestions.push({
        platform,
        recommended: false,
        reason: `${label} does not support ${formLabel(form).toLowerCase()}s in Social0`,
      });
      continue;
    }

    const { recommended, reason } = scorePlatform(platform, form, input.content);
    suggestions.push({ platform, recommended, reason });
  }

  const priority = FORM_PRIORITY[form];
  return suggestions.sort((a, b) => {
    const recommendedDelta = Number(b.recommended) - Number(a.recommended);
    if (recommendedDelta !== 0) return recommendedDelta;
    return priority.indexOf(a.platform) - priority.indexOf(b.platform);
  });
}

export function formatPlatformSuggestions(
  suggestions: PlatformSuggestion[],
  form: PostForm,
): string {
  const header = `Content type: ${formLabel(form)} (${form})`;
  const basis = "Basis: connected accounts, Social0 post-type support, caption length, links, and media type.";
  const lines = suggestions.map((s) => {
    const icon = s.recommended ? "✅" : "❌";
    const label = PLATFORM_LABELS[s.platform as Platform] ?? s.platform;
    return `${icon} ${label} — ${s.reason}`;
  });
  return `${header}\n${basis}\n\n${lines.join("\n")}`;
}
