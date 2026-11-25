/**
 * Free tools (no signup). One post-preview page per platform.
 * scripts/generate-sitemap.mjs reads slug/metaTitle/metaDescription from this
 * file with a regex, so keep `metaDescription:` followed by the string on the next line.
 */
export type FreeToolFaq = { question: string; answer: string };

export type PreviewPlatform = {
  slug: string;
  /** Key in PLATFORM_CHAR_LIMITS. */
  platform: string;
  name: string;
  /** Visible characters before the feed folds the post ("…more"). */
  fold: number | null;
  foldLabel: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  limits: string[];
  faq: FreeToolFaq[];
};

export const FREE_TOOLS_PATH = "/free-tools";
export const postPreviewPath = (slug: string) => `${FREE_TOOLS_PATH}/post-preview/${slug}`;

const scheduleFaq = (name: string): FreeToolFaq => ({
  question: `Can I schedule this ${name} post from here?`,
  answer: `Yes. Press "Schedule this post" and Social0 opens your text as a draft. The free plan covers 3 accounts and 10 posts, and the same post can go to ${name} and 8 other networks at once.`,
});

export const PREVIEW_PLATFORMS: PreviewPlatform[] = [
  {
    slug: "linkedin",
    platform: "linkedin",
    name: "LinkedIn",
    fold: 210,
    foldLabel: "…more",
    metaTitle: "LinkedIn Post Preview & Character Counter (Free) | Social0",
    metaDescription:
      "See how your LinkedIn post looks before you publish: live preview, 3,000-character counter and where “…more” cuts it. Free, no signup.",
    intro:
      "Paste your post to see it the way LinkedIn shows it in the feed. The counter checks the 3,000-character limit, and the preview marks where LinkedIn folds the text behind \"…more\", so your hook lands in the part people actually read.",
    limits: [
      "Post: 3,000 characters.",
      "The feed shows roughly the first 210 characters on desktop (fewer on phones) before \"…more\".",
      "Comment: 1,250 characters. Headline: 220 characters.",
    ],
    faq: [
      {
        question: "What is the LinkedIn post character limit?",
        answer: "3,000 characters for a regular post, including spaces and line breaks. Comments allow 1,250.",
      },
      {
        question: "Where does LinkedIn cut off a post with \"…more\"?",
        answer:
          "After about 210 characters on desktop, and sooner on phones or when the post starts with several short lines. Put the hook in the first one or two lines.",
      },
      scheduleFaq("LinkedIn"),
    ],
  },
  {
    slug: "x",
    platform: "twitter_x",
    name: "X (Twitter)",
    fold: null,
    foldLabel: "Show more",
    metaTitle: "X (Twitter) Character Counter & Tweet Preview, incl. Premium | Social0",
    metaDescription:
      "Count characters the way X does (links = 23, emoji = 2) and preview your post. Switch on Premium for the 25,000 limit. Free, no signup.",
    intro:
      "X doesn't count characters one by one: every link counts as 23, and emoji and most non-Latin letters count as 2. This counter uses the same rules, so 280 here means 280 on X. Have Premium? Switch it on to check the 25,000 limit and see where your long post gets folded behind \"Show more\".",
    limits: [
      "Free accounts: 280 weighted characters per post.",
      "Premium: 25,000 characters. The timeline shows the first 280, then \"Show more\".",
      "Every link counts 23, whatever its length. Emoji count 2.",
    ],
    faq: [
      {
        question: "What is the X (Twitter) character limit?",
        answer: "280 weighted characters for free accounts and 25,000 for Premium subscribers.",
      },
      {
        question: "Why does my tweet count more than the letters I typed?",
        answer:
          "X counts every link as 23 characters and counts emoji, Chinese, Japanese and Korean characters as 2 each.",
      },
      {
        question: "Do long Premium posts show in full?",
        answer:
          "No. The timeline shows the first 280 characters and a \"Show more\" link, so the opening still needs to work on its own.",
      },
      scheduleFaq("X"),
    ],
  },
  {
    slug: "instagram",
    platform: "instagram",
    name: "Instagram",
    fold: 125,
    foldLabel: "…more",
    metaTitle: "Instagram Caption Preview & Character Counter (Free) | Social0",
    metaDescription:
      "Preview your Instagram caption, count it against the 2,200-character limit and see where “…more” cuts it in the feed. Free, no signup.",
    intro:
      "Instagram captions can be long, but the feed shows only the first line or two. Paste your caption to check the 2,200-character limit and see what people read before they tap \"…more\".",
    limits: [
      "Caption: 2,200 characters.",
      "The feed shows about the first 125 characters before \"…more\".",
      "Up to 30 hashtags per post.",
    ],
    faq: [
      {
        question: "What is the Instagram caption character limit?",
        answer: "2,200 characters, including hashtags, emoji and line breaks.",
      },
      {
        question: "How much of a caption shows before \"more\"?",
        answer: "About 125 characters, often less if the caption starts with line breaks. Lead with the point.",
      },
      scheduleFaq("Instagram"),
    ],
  },
  {
    slug: "threads",
    platform: "threads",
    name: "Threads",
    fold: null,
    foldLabel: "",
    metaTitle: "Threads Character Counter & Post Preview (Free) | Social0",
    metaDescription:
      "Check your Threads post against the 500-character limit and preview it before posting. Free, no signup, works on your phone.",
    intro: "Threads posts are capped at 500 characters. Paste yours to see the count and a preview of how it reads in the feed.",
    limits: ["Post: 500 characters.", "Links count at their full length."],
    faq: [
      {
        question: "What is the Threads character limit?",
        answer: "500 characters per post, including spaces and emoji.",
      },
      scheduleFaq("Threads"),
    ],
  },
  {
    slug: "bluesky",
    platform: "bluesky",
    name: "Bluesky",
    fold: null,
    foldLabel: "",
    metaTitle: "Bluesky Character Counter & Post Preview (Free) | Social0",
    metaDescription:
      "Count your Bluesky post against the 300-character limit (graphemes, so emoji count once) and preview it. Free, no signup.",
    intro:
      "Bluesky allows 300 characters, counted as graphemes: an emoji or an accented letter counts once. Paste your post to check it and preview it.",
    limits: ["Post: 300 graphemes (what you see as characters)."],
    faq: [
      {
        question: "What is the Bluesky character limit?",
        answer: "300 characters, counted as graphemes, so a family emoji or an accented letter counts as one.",
      },
      scheduleFaq("Bluesky"),
    ],
  },
  {
    slug: "facebook",
    platform: "facebook",
    name: "Facebook",
    fold: null,
    foldLabel: "",
    metaTitle: "Facebook Post Preview & Character Counter (Free) | Social0",
    metaDescription:
      "Preview your Facebook Page post and count characters against the 63,206 limit. Free, no signup.",
    intro:
      "Facebook allows very long posts (63,206 characters), but long posts are folded behind \"See more\". Paste yours to count it and preview it.",
    limits: ["Post: 63,206 characters.", "Longer posts are folded behind \"See more\" in the feed."],
    faq: [
      {
        question: "What is the Facebook post character limit?",
        answer: "63,206 characters for a post on a Page or profile.",
      },
      scheduleFaq("Facebook"),
    ],
  },
  {
    slug: "tiktok",
    platform: "tiktok",
    name: "TikTok",
    fold: null,
    foldLabel: "",
    metaTitle: "TikTok Caption Character Counter & Preview (Free) | Social0",
    metaDescription:
      "Count your TikTok caption against the 4,000-character limit and preview it. Free, no signup.",
    intro:
      "TikTok captions can run up to 4,000 characters, though only the first lines show over the video. Paste your caption to check it.",
    limits: ["Caption: 4,000 characters.", "Only the first lines show over the video until someone taps it."],
    faq: [
      {
        question: "What is the TikTok caption character limit?",
        answer: "4,000 characters, including hashtags and mentions.",
      },
      scheduleFaq("TikTok"),
    ],
  },
  {
    slug: "youtube",
    platform: "youtube",
    name: "YouTube",
    fold: 150,
    foldLabel: "…more",
    metaTitle: "YouTube Description Character Counter & Preview (Free) | Social0",
    metaDescription:
      "Count your YouTube description against the 5,000-character limit and see what shows before “…more”. Titles: 100 characters. Free.",
    intro:
      "YouTube descriptions allow 5,000 characters, but viewers see only the first lines before \"…more\". Paste yours to check the limit and the part that shows.",
    limits: ["Description: 5,000 characters.", "Title: 100 characters.", "About the first 150 characters show above \"…more\"."],
    faq: [
      {
        question: "What is the YouTube description character limit?",
        answer: "5,000 characters. Video titles are limited to 100.",
      },
      scheduleFaq("YouTube"),
    ],
  },
  {
    slug: "pinterest",
    platform: "pinterest",
    name: "Pinterest",
    fold: null,
    foldLabel: "",
    metaTitle: "Pinterest Pin Description Character Counter (Free) | Social0",
    metaDescription:
      "Count your Pin description against the 500-character limit and preview it. Pin titles: 100 characters. Free, no signup.",
    intro: "Pin descriptions allow 500 characters and titles 100. Paste your description to check it.",
    limits: ["Description: 500 characters.", "Title: 100 characters."],
    faq: [
      {
        question: "What is the Pinterest description character limit?",
        answer: "500 characters for the description and 100 for the Pin title.",
      },
      scheduleFaq("Pinterest"),
    ],
  },
];

export const SAMPLE_POST = `I scheduled 30 days of posts in 20 minutes.

Here's the setup I use every Monday:

1. Write 5 posts in one doc
2. Paste each into Social0
3. Pick 9 networks, hit schedule

No copy-pasting into 9 apps. No missed days.

What's your Monday routine?`;
