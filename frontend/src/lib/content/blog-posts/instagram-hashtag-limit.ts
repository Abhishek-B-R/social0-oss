import type { BlogPost } from "../blog-types";

export const instagramHashtagLimit: BlogPost = {
  slug: "instagram-hashtag-limit",
  category: "Platform specs",
  metaTitle: "Instagram's 5-Hashtag Limit: What Changed and What Works Now",
  metaDescription:
    "Instagram cut hashtags from 30 to 5 in December 2025. What the cap actually enforces, why the old block strategy is dead, and how to pick five tags that still earn discovery.",
  keywords: [
    "instagram hashtag limit",
    "how many hashtags on instagram",
    "instagram 5 hashtag limit",
    "instagram hashtags 2026",
    "do hashtags still work instagram",
    "instagram hashtag strategy",
  ],
  title: "Instagram's 5-hashtag limit: what changed and what works now",
  excerpt:
    "Thirty hashtags became five in December 2025, and it is enforced at publish time — not a suggestion. Here is what the cap covers, why Instagram made the change, and how to choose five tags that do real work.",
  datePublished: "2026-09-20",
  readingMinutes: 8,
  body: [
    {
      type: "paragraph",
      text: "On 19 December 2025, Instagram announced that every feed post and Reel is capped at **five hashtags**. The previous limit was thirty. This was confirmed by Instagram's own Creators account and by Adam Mosseri, and it is enforced at publish time rather than being advisory.",
    },
    {
      type: "paragraph",
      text: "If your workflow involved a saved block of twenty-five tags pasted into a first comment, that workflow no longer runs.",
    },
    {
      type: "heading",
      text: "What the cap actually covers",
    },
    {
      type: "list",
      items: [
        "**Feed posts and Reels**, both capped at five.",
        "**Caption and comments together.** Moving tags into a first comment does not buy you extra — the old standard workaround is closed.",
        "**Enforced, not ignored.** Exceeding it means the post is blocked or the extra tags are stripped, depending on surface. You do not get a silent pass.",
      ],
    },
    {
      type: "callout",
      title: "If you publish through an API",
      text: "This is a validation rule, not a style guide. A scheduler or integration that still sends thirty tags will start producing publish failures or silently truncated captions. Anything you built against the old limit needs its validation updated.",
    },
    {
      type: "heading",
      text: "Why Instagram did it",
    },
    {
      type: "paragraph",
      text: "The stated reason is content quality: long tag lists were mostly irrelevant to the post and used to game discovery, which made the signal worse for everyone. The more useful read is strategic — **Instagram is becoming a search engine**, and hashtags were getting in the way.",
    },
    {
      type: "paragraph",
      text: "Discovery on Instagram now leans on the platform understanding your content directly: it reads your caption, analyses your image and video, and matches all of that against what people type into search. In that world, thirty generic tags are noise that makes classification harder, not easier. Five precise ones are a useful hint.",
    },
    {
      type: "heading",
      text: "What hashtags do now",
    },
    {
      type: "paragraph",
      text: "The honest framing: hashtags are **categorisation signals, not distribution levers.** They tell Instagram what your post is about so it can place you in the right topic neighbourhoods. They do not, by themselves, push your post to more people.",
    },
    {
      type: "table",
      columns: ["Old model (pre-2026)", "Current model"],
      rows: [
        [
          "Tags were discovery surfaces people browsed.",
          "Tags are classification input for recommendations and search.",
        ],
        [
          "More tags = wider net.",
          "More tags = diluted signal (and now, a rejected post).",
        ],
        [
          "Mixing big and small tags was the standard play.",
          "Precision beats volume; a huge generic tag mostly wastes a slot.",
        ],
        [
          "Hashtags drove reach.",
          "Caption keywords and content quality drive reach; tags refine placement.",
        ],
      ],
    },
    {
      type: "heading",
      text: "How to choose five",
    },
    {
      type: "paragraph",
      text: "With five slots, each one should be doing a distinct job. A structure that works:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**One topic tag** — what the post is actually about, specifically. `#sourdoughstarter`, not `#food`.",
        "**One niche/community tag** — where your people already gather. Smaller is better; a tag with 400k posts beats one with 40m.",
        "**One audience or intent tag** — who it is for or what they are trying to do. `#firsttimefounder`, `#mealprepforone`.",
        "**One local or contextual tag** — city, region, event, or season, if genuinely relevant. Local tags punch well above their size.",
        "**One branded tag** — yours. It compounds over time and makes your own archive searchable.",
      ],
    },
    {
      type: "paragraph",
      text: "If a tag does not fit one of those jobs, leave the slot empty. Four good tags beat five where the fifth is `#instagood`.",
    },
    {
      type: "callout",
      title: "The bigger lever is your caption",
      text: "Instagram matches search queries against captions, usernames, bios, and locations. A caption written in the words your audience would actually type now does more discovery work than the tags do. Write the first sentence for a human and the rest for search — in that order.",
    },
    {
      type: "heading",
      text: "What this breaks in a cross-posting workflow",
    },
    {
      type: "paragraph",
      text: "This change makes one caption for all networks meaningfully harder, because the hashtag conventions have now diverged sharply:",
    },
    {
      type: "table",
      columns: ["Platform", "Hashtag reality"],
      rows: [
        ["Instagram", "Hard cap of 5. Exceeding it fails or truncates."],
        ["TikTok", "Still genuinely useful for discovery. No comparable hard cap."],
        ["LinkedIn", "About three is the convention; more reads as spam."],
        ["X", "Little benefit. One or two at most."],
        ["Bluesky", "Minimal benefit; the feed is not tag-driven."],
        ["Threads", "Supports a single topic tag."],
        ["Pinterest", "Descriptions are keyword-driven rather than tag-driven."],
      ],
    },
    {
      type: "paragraph",
      text: "So a shared tag block is now actively harmful in both directions: too many for Instagram to accept, and mostly dead weight on X and Bluesky. This is exactly the case for per-platform caption overrides — one base caption, with the tag line adjusted where the network demands it.",
    },
    {
      type: "cta",
      text: "Override the caption only on the networks that need different tags.",
      href: "/features/instagram-scheduler",
      label: "See the Instagram scheduler",
    },
    {
      type: "heading",
      text: "What to do this week",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Delete your saved hashtag block.** It is now a liability, not an asset.",
        "**Audit scheduled posts.** Anything queued with more than five tags will fail or be trimmed when it fires. Fix them before they go out.",
        "**Update any API validation** you own to reject more than five before upload rather than discovering it from a platform error.",
        "**Rewrite captions for search**, using the phrasing your audience would type.",
        "**Build a small tag library** — five to ten per content pillar — and pick from it rather than reusing one universal set.",
      ],
    },
    {
      type: "paragraph",
      text: "The change is less painful than it first looks. The thirty-tag block was never producing much value; it just felt like effort. Five deliberate tags plus a caption written for search is both less work and better aligned with how Instagram now finds things.",
    },
  ],
  faq: [
    {
      question: "How many hashtags can you use on Instagram in 2026?",
      answer:
        "Five per feed post or Reel. Instagram announced the change on 19 December 2025, reducing the limit from thirty. It is enforced at publish time — exceeding it blocks the post or strips the extra tags.",
    },
    {
      question: "Does putting hashtags in the first comment get around the limit?",
      answer:
        "No. The cap applies to the caption and comments together, which closes the standard workaround. Five is the total across both.",
    },
    {
      question: "Do hashtags still work on Instagram?",
      answer:
        "Yes, but as categorisation signals rather than distribution levers. They help Instagram understand what your post is about so it can place it in the right recommendations and search results. They no longer push your post to a wider audience on their own.",
    },
    {
      question: "Why did Instagram reduce the hashtag limit to 5?",
      answer:
        "Officially, to cut down on irrelevant tags used to game discovery. Strategically, Instagram is shifting toward search: it reads captions, images, and video directly to classify content, and long generic tag lists made that classification worse rather than better.",
    },
    {
      question: "What happens to scheduled posts that already have 30 hashtags?",
      answer:
        "They will fail to publish or have the extra tags stripped when they fire, depending on the surface. Audit anything already queued and trim it to five before it goes out.",
    },
  ],
  relatedPaths: [
    { href: "/features/instagram-scheduler", label: "Instagram scheduler" },
    { href: "/features/multi-platform-scheduler", label: "Multi-platform scheduler" },
  ],
  relatedSlugs: [
    "social-media-character-limits",
    "cross-posting-vs-repurposing",
    "instagram-api-rate-limits",
  ],
};
