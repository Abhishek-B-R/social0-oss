import type { BlogBlock, BlogPost, BlogCategory } from "./blog-types";
import { slugifyHeading } from "@/lib/rich-text";
import { connectSocialAccountsTroubleshooting } from "./blog-posts/connect-social-accounts-troubleshooting";
import { instagramAlgorithmGuide } from "./blog-posts/instagram-algorithm-guide";
import { tiktokAlgorithmGuide } from "./blog-posts/tiktok-algorithm-guide";
import { xAlgorithmGuide } from "./blog-posts/x-algorithm-guide";
import { instagramHashtagLimit } from "./blog-posts/instagram-hashtag-limit";
import { linkedinAlgorithmGuide } from "./blog-posts/linkedin-algorithm-guide";
import { managingMultipleSocialAccounts } from "./blog-posts/managing-multiple-social-accounts";
import { reelsVsTiktokVsShorts } from "./blog-posts/reels-vs-tiktok-vs-shorts";
import { socialMediaEngagementRate } from "./blog-posts/social-media-engagement-rate";
import { bestTimeToPostOnSocialMedia } from "./blog-posts/best-time-to-post-on-social-media";
import { blueskyAndThreadsForBrands } from "./blog-posts/bluesky-and-threads-for-brands";
import { crossPostingVsRepurposing } from "./blog-posts/cross-posting-vs-repurposing";
import { instagramApiRateLimits } from "./blog-posts/instagram-api-rate-limits";
import { postToSocialMediaWithAiAgents } from "./blog-posts/post-to-social-media-with-ai-agents";
import { socialMediaAutomationForDevelopers } from "./blog-posts/social-media-automation-for-developers";
import { socialMediaCharacterLimits } from "./blog-posts/social-media-character-limits";
import { socialMediaContentCalendar } from "./blog-posts/social-media-content-calendar";
import { socialMediaImageSizes } from "./blog-posts/social-media-image-sizes";
import { socialMediaPostingApiGuide } from "./blog-posts/social-media-posting-api-guide";
import { socialMediaVideoSpecs } from "./blog-posts/social-media-video-specs";
import { whyScheduledPostsFail } from "./blog-posts/why-scheduled-posts-fail";

/** Newest first. The index page and sitemap both read this order. */
export const BLOG_POSTS: BlogPost[] = [
  instagramHashtagLimit,
  instagramAlgorithmGuide,
  tiktokAlgorithmGuide,
  xAlgorithmGuide,
  linkedinAlgorithmGuide,
  socialMediaEngagementRate,
  reelsVsTiktokVsShorts,
  managingMultipleSocialAccounts,
  connectSocialAccountsTroubleshooting,
  blueskyAndThreadsForBrands,
  socialMediaAutomationForDevelopers,
  whyScheduledPostsFail,
  instagramApiRateLimits,
  socialMediaPostingApiGuide,
  socialMediaContentCalendar,
  postToSocialMediaWithAiAgents,
  crossPostingVsRepurposing,
  bestTimeToPostOnSocialMedia,
  socialMediaImageSizes,
  socialMediaVideoSpecs,
  socialMediaCharacterLimits,
].sort((a, b) => b.datePublished.localeCompare(a.datePublished));

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`;
}

/** Categories that actually have posts, in the order they first appear. */
export function usedBlogCategories(): BlogCategory[] {
  const seen: BlogCategory[] = [];
  for (const post of BLOG_POSTS) {
    if (!seen.includes(post.category)) seen.push(post.category);
  }
  return seen;
}

/**
 * Related reading for an article: the explicit `relatedSlugs` first, then
 * same-category posts as filler, never the article itself.
 */
export function relatedBlogPosts(post: BlogPost, limit = 3): BlogPost[] {
  const picked: BlogPost[] = [];
  const take = (candidate: BlogPost | undefined) => {
    if (!candidate) return;
    if (candidate.slug === post.slug) return;
    if (picked.some((p) => p.slug === candidate.slug)) return;
    if (picked.length >= limit) return;
    picked.push(candidate);
  };

  for (const slug of post.relatedSlugs ?? []) take(getBlogPost(slug));
  for (const candidate of BLOG_POSTS) {
    if (picked.length >= limit) break;
    if (candidate.category === post.category) take(candidate);
  }
  for (const candidate of BLOG_POSTS) {
    if (picked.length >= limit) break;
    take(candidate);
  }

  return picked;
}

export function formatBlogDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** h2 headings only — the article's table of contents. */
export function blogTableOfContents(
  blocks: BlogBlock[],
): { id: string; text: string }[] {
  return blocks
    .filter(
      (block): block is Extract<BlogBlock, { type: "heading" }> =>
        block.type === "heading",
    )
    .map((block) => ({ id: slugifyHeading(block.text), text: block.text }));
}
