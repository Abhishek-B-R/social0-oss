import type { BlogPost } from "../blog-types";

export const socialMediaCharacterLimits: BlogPost = {
  slug: "social-media-character-limits",
  category: "Platform specs",
  metaTitle: "Social Media Character Limits (2026): Every Platform in One Table",
  metaDescription:
    "Caption and character limits for X, LinkedIn, Instagram, TikTok, Threads, Bluesky, Pinterest, YouTube, and Facebook — plus what actually counts as a character on each network.",
  keywords: [
    "social media character limits",
    "social media caption length",
    "x character limit",
    "linkedin character limit",
    "instagram caption limit",
    "threads character limit",
    "bluesky character limit",
    "tiktok caption limit",
  ],
  title: "Social media character limits in 2026: every platform in one table",
  excerpt:
    "Nine networks, nine different ceilings — and three different ideas of what a character even is. Here is the full table, the counting rules that trip people up, and how to write one caption that survives all of them.",
  datePublished: "2026-08-05",
  dateModified: "2026-09-20",
  readingMinutes: 9,
  body: [
    {
      type: "paragraph",
      text: "Every cross-posting workflow eventually hits the same wall: you write one good caption, send it to five networks, and two of them truncate it. The fix is not writing shorter — it is knowing exactly where each ceiling sits, and which ceiling binds first.",
    },
    {
      type: "paragraph",
      text: "The table below is the set of limits **Social0 enforces in its own composer** before a post is allowed out. They are the practical ceilings for API publishing, which is not always the same as what the native app will let you paste in.",
    },
    {
      type: "heading",
      text: "The 2026 character limit table",
    },
    {
      type: "table",
      caption:
        "Caption ceilings enforced at publish time. Where a network exposes several fields, the binding one is noted.",
      columns: ["Platform", "Character limit", "Notes"],
      rows: [
        [
          "X (Twitter)",
          "280 — 25,000 with Premium",
          "The Premium ceiling only applies once the connected account is actually verified.",
        ],
        [
          "Bluesky",
          "300",
          "Graphemes, not bytes. Links count in full — there is no shortener.",
        ],
        ["Threads", "500", "Per post. A thread multiplies the budget."],
        [
          "Pinterest",
          "500",
          "Pin description. The title field is separate and much shorter.",
        ],
        [
          "Instagram",
          "2,200",
          "Caption including hashtags. Roughly 125 characters show before “more”.",
        ],
        [
          "LinkedIn",
          "3,000",
          "Around 140–210 characters show before “see more”, depending on surface.",
        ],
        [
          "TikTok",
          "4,000 photo description / 2,200 video caption",
          "Two different fields with two different ceilings. Photo titles cap at 90.",
        ],
        ["YouTube", "5,000", "Video description. Titles cap at 100."],
        [
          "Facebook",
          "63,206",
          "Effectively unlimited. Reach falls off long before the limit does.",
        ],
      ],
    },
    {
      type: "callout",
      title: "The number that actually matters",
      text: "If you publish the same caption to X and Bluesky, your real budget is **280 characters**, not 300 — the most restrictive network in the selection sets the ceiling for the whole post. Social0 shows that number live in the composer as you pick accounts.",
    },
    {
      type: "heading",
      text: "What counts as one character",
    },
    {
      type: "paragraph",
      text: "This is where identical text passes on one network and fails on another. The limits above are not measured the same way.",
    },
    {
      type: "subheading",
      text: "Links",
    },
    {
      type: "paragraph",
      text: "X runs every URL through its `t.co` shortener and charges a flat 23 characters no matter how long the real link is. Bluesky, Threads, and Mastodon do not shorten at all — a 90-character UTM-tagged URL costs you 90 of your 300. If you are writing one caption for both, budget for the honest length and let X give you the slack back.",
    },
    {
      type: "subheading",
      text: "Emoji and non-Latin scripts",
    },
    {
      type: "paragraph",
      text: "A single emoji is rarely a single character. Skin-tone and family emoji are built from several code points joined by zero-width joiners, so one 👨‍👩‍👧‍👦 can cost seven or more against a byte- or code-point-based counter. Networks that count **graphemes** (what a human sees as one symbol) charge you 1. Networks that count UTF-16 code units charge you more.",
    },
    {
      type: "paragraph",
      text: "The same split hits CJK text, Devanagari, and Arabic. If your audience writes in any of these, test against the real counter rather than a word processor's.",
    },
    {
      type: "subheading",
      text: "Hashtags and mentions",
    },
    {
      type: "paragraph",
      text: "They are ordinary characters everywhere, and they count against the caption limit. The bigger change is that **Instagram now caps posts and Reels at five hashtags**, down from thirty — announced in December 2025 and enforced at publish time, whether the tags sit in the caption or a first comment. The old thirty-tag dump is no longer a strategy you can execute even if you want to.",
    },
    {
      type: "heading",
      text: "Truncation points matter more than limits",
    },
    {
      type: "paragraph",
      text: "Almost nobody writes to the ceiling. The number that changes performance is the **fold** — the point where the feed cuts your caption and adds a “more” link. Past the fold, your copy is behind a tap.",
    },
    {
      type: "table",
      caption: "Approximate visible characters before the feed truncates.",
      columns: ["Platform", "Visible before the fold", "Practical implication"],
      rows: [
        [
          "Instagram",
          "~125",
          "Put the hook and any CTA in the first sentence; hashtags last.",
        ],
        [
          "LinkedIn",
          "~140–210",
          "The first two lines decide whether the post gets expanded at all.",
        ],
        [
          "Facebook",
          "~250–280",
          "Longer than most people assume, but the first line still carries it.",
        ],
        [
          "TikTok / Instagram Reels",
          "~70–100",
          "Overlaid on video and competing with UI. Keep it very short.",
        ],
        [
          "X",
          "Full post to 280",
          "Nothing folds under the standard limit; long Premium posts do.",
        ],
      ],
    },
    {
      type: "callout",
      title: "Rule of thumb",
      text: "Write the first 125 characters as if they are the entire post. Everything after that is for the readers you already convinced.",
    },
    {
      type: "heading",
      text: "Writing one caption for nine networks",
    },
    {
      type: "paragraph",
      text: "There are three workable strategies, in increasing order of effort and payoff.",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Write to the floor.** Draft at the most restrictive limit in your selection — usually X's 280 or Bluesky's 300 — and ship the same text everywhere. Fast, safe, and leaves LinkedIn's 3,000 characters unused.",
        "**Write long, override short.** Draft the full LinkedIn-length version, then override the caption just for the short-form networks. This is what per-platform captions exist for.",
        "**Write a thread.** On X, Threads, and Bluesky a multi-post thread turns a hard ceiling into a soft one. One idea per post, and the first post still has to earn the tap.",
      ],
    },
    {
      type: "paragraph",
      text: "Social0 supports all three: one base caption, per-account overrides where a network needs different copy, and native thread composition for X, Threads, and Bluesky. The composer shows the binding limit for the accounts you have selected and blocks the publish rather than letting a network silently truncate you.",
    },
    {
      type: "cta",
      text: "Write once, override only where a network forces you to.",
      href: "/features",
      label: "See the per-platform composer",
    },
    {
      type: "heading",
      text: "Limits that are not character counts",
    },
    {
      type: "paragraph",
      text: "Captions are the limit people remember. These are the ones that actually break a publish:",
    },
    {
      type: "list",
      items: [
        "**Media counts.** Instagram carousels cap at 20 items; X allows 4 images per post; Bluesky allows 4.",
        "**Hashtag counts.** Instagram caps at 5 per post or Reel since December 2025. Others have no hard cap but heavily discount them.",
        "**Alt text.** X and Bluesky cap alt text around 1,000 and 2,000 characters respectively — generous, but it is a separate field with its own ceiling.",
        "**Video duration and file size.** The most common cause of a failed cross-post, and a much bigger spread than captions. We broke these out in [the video specs guide](/blog/social-media-video-specs).",
      ],
    },
    {
      type: "heading",
      text: "Keeping this table current",
    },
    {
      type: "paragraph",
      text: "These numbers move. X's Premium ceiling, Bluesky's video length, and Instagram's API duration cap have all changed in the last two years. If you are building against them programmatically, read them from one constant in your own codebase rather than sprinkling magic numbers through your publisher — and re-check them when a publish starts failing with a validation error you have not seen before.",
    },
    {
      type: "paragraph",
      text: "If you would rather not track them at all, that is precisely the job a scheduler should be doing for you.",
    },
  ],
  faq: [
    {
      question: "What is the character limit on X in 2026?",
      answer:
        "280 characters for standard accounts and up to 25,000 for verified Premium accounts. Links always count as 23 characters regardless of their real length, because X rewrites them through its t.co shortener.",
    },
    {
      question: "Which social platform has the shortest character limit?",
      answer:
        "X at 280 characters for non-Premium accounts. Bluesky is next at 300. If you cross-post to either, they set the effective ceiling for the whole post.",
    },
    {
      question: "Do hashtags count toward the character limit?",
      answer:
        "Yes, on every platform. Instagram's 2,200-character limit includes the hashtag block, and since December 2025 Instagram separately caps posts and Reels at five hashtags, down from thirty.",
    },
    {
      question: "How many characters show before Instagram truncates a caption?",
      answer:
        "Roughly 125 characters before the “more” link appears, though it varies with the surface and the account name length. Put your hook and call to action in the first sentence.",
    },
    {
      question: "Can I write one caption for all platforms?",
      answer:
        "Yes, if you write to the most restrictive limit in your selection. The better approach is one base caption plus per-platform overrides where a network needs shorter copy or different hashtags, which is how Social0's composer works.",
    },
  ],
  relatedPaths: [
    { href: "/features", label: "Platform schedulers" },
    { href: "/features/twitter-scheduler", label: "X (Twitter) scheduler" },
    { href: "/features/linkedin-scheduler", label: "LinkedIn scheduler" },
  ],
  relatedSlugs: [
    "social-media-video-specs",
    "social-media-image-sizes",
    "cross-posting-vs-repurposing",
  ],
};
