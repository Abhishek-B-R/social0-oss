/**
 * Generated blog covers: each post gets 2-3 short chips (facts or topics from the
 * article) drawn on a category-tinted panel. No image files to maintain.
 */
import type { BlogCategory } from "./blog-types";

export const COVER_CHIPS: Record<string, string[]> = {
  "best-time-to-post-on-social-media": ["Best times", "By platform", "Your own data"],
  "black-friday-social-media-scheduler-deals": ["BLACKFRIDAY", "20% off", "Until Dec 1"],
  "bluesky-and-threads-for-brands": ["Bluesky", "vs", "Threads"],
  "connect-social-accounts-troubleshooting": ["OAuth", "Permissions", "Reconnect"],
  "cross-posting-vs-repurposing": ["Cross-post", "Repurpose", "9 networks"],
  "how-to-cancel-buffer": ["Cancel Buffer", "Export posts", "No gaps"],
  "how-to-cancel-hootsuite": ["Cancel Hootsuite", "No surprise charge"],
  "instagram-algorithm-guide": ["Instagram", "Ranking signals", "2026"],
  "instagram-api-rate-limits": ["Instagram API", "Rate limits", "Quotas"],
  "instagram-hashtag-limit": ["5 hashtags", "Instagram", "What works now"],
  "linkedin-algorithm-guide": ["LinkedIn", "Ranking signals", "2026"],
  "managing-multiple-social-accounts": ["Many accounts", "One calendar", "Teams"],
  "post-to-social-media-with-ai-agents": ["MCP", "Claude", "ChatGPT"],
  "reels-vs-tiktok-vs-shorts": ["Reels", "TikTok", "Shorts"],
  "social-media-automation-for-developers": ["CLI", "CI", "Webhooks"],
  "social-media-character-limits": ["X 280", "Threads 500", "LinkedIn 3,000"],
  "social-media-content-calendar": ["Content calendar", "Weekly batch"],
  "social-media-engagement-rate": ["Engagement rate", "Formulas", "Benchmarks"],
  "social-media-image-sizes": ["1080 × 1350", "1200 × 630", "1080 × 1920"],
  "social-media-posting-api-guide": ["REST API", "POST /v1/posts", "9 networks"],
  "social-media-video-specs": ["9:16", "MP4", "Length limits"],
  "tiktok-algorithm-guide": ["TikTok", "For You", "2026"],
  "why-scheduled-posts-fail": ["Retries", "Tokens", "Queues"],
  "x-algorithm-guide": ["X", "Ranking signals", "2026"],
};

/** Two-colour wash per category (works on light and dark). */
export const COVER_TINTS: Record<BlogCategory, [string, string]> = {
  "Platform specs": ["#10b981", "#0ea5e9"],
  Strategy: ["#f59e0b", "#10b981"],
  Engineering: ["#6366f1", "#0ea5e9"],
  "AI & automation": ["#a855f7", "#10b981"],
};
