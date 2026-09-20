import type { BlogPost } from "../blog-types";

export const instagramApiRateLimits: BlogPost = {
  slug: "instagram-api-rate-limits",
  category: "Engineering",
  metaTitle: "Instagram API Rate Limits Explained (2026 Developer Guide)",
  metaDescription:
    "How Instagram's publishing cap, rolling 24-hour window, container limits, and hourly call quotas actually work — including error code 9 and how to design a publisher around them.",
  keywords: [
    "instagram api rate limits",
    "instagram publishing limit",
    "instagram graph api error 9",
    "instagram 25 posts per day",
    "instagram content publishing api",
    "instagram api quota",
  ],
  title: "Instagram API rate limits, explained properly",
  excerpt:
    "The publishing cap is not a daily reset, the documented numbers contradict each other, and error code 9 does not mean what it says. Here is how the limits actually behave and how to build against them.",
  datePublished: "2026-09-12",
  dateModified: "2026-09-20",
  readingMinutes: 9,
  body: [
    {
      type: "paragraph",
      text: "Instagram's publishing limits cause more confused support tickets than any other platform, for three reasons: the window is rolling rather than daily, the official documentation gives contradictory numbers, and the error you get back is generic.",
    },
    {
      type: "paragraph",
      text: "Here is what the behaviour actually is, and what that means if you are building or operating a publisher.",
    },
    {
      type: "heading",
      text: "The publishing cap",
    },
    {
      type: "paragraph",
      text: "Each Instagram Professional account has a limit on the number of posts published **through the API** in a 24-hour moving period. The commonly cited figure is 25. Meta's own documentation has at various points stated 25, 50, and 100 in different places — and the 25 that everyone quotes is not in the current docs at all.",
    },
    {
      type: "callout",
      title: "Design for 25",
      text: "When a platform's documentation contradicts itself, build against the **most conservative** number you have seen. If your system assumes 50 and the real limit is 25, you discover it as a production failure on a customer's launch day.",
    },
    {
      type: "paragraph",
      text: "Two things this cap does *not* include: posts made in the Instagram app by hand, and Stories, which have their own separate allowance.",
    },
    {
      type: "heading",
      text: "Rolling window, not daily reset",
    },
    {
      type: "paragraph",
      text: "This is the detail that causes most of the confusion. The window is a **24-hour moving period**, not a calendar day. Capacity does not return at midnight — each individual publish frees its own slot exactly 24 hours after it happened.",
    },
    {
      type: "paragraph",
      text: "The practical consequence:",
    },
    {
      type: "list",
      items: [
        "Publish 25 posts at 09:00 Monday and you are blocked until 09:00 Tuesday — not until Tuesday 00:00.",
        "Publish 25 spread evenly through Monday and capacity returns gradually through Tuesday, one slot at a time.",
        "A burst is strictly worse than an even spread. It concentrates your blackout into one contiguous block.",
      ],
    },
    {
      type: "paragraph",
      text: "So if you are building a bulk scheduler, spreading posts across the window is not just good for engagement — it is what keeps the account publishable.",
    },
    {
      type: "heading",
      text: "Error code 9",
    },
    {
      type: "paragraph",
      text: "When you hit the cap, the API returns error code 9 — nominally “application request limit reached”. The name is misleading: it is an **account-level** publishing limit, not an app-level one. Every account you manage has its own independent budget.",
    },
    {
      type: "code",
      language: "json",
      code: `{
  "error": {
    "message": "Application request limit reached",
    "type": "OAuthException",
    "code": 9
  }
}`,
    },
    {
      type: "paragraph",
      text: "The correct handling is specific, and getting it wrong is expensive:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Do not retry immediately.** The condition will not clear for hours. An exponential backoff that tops out in minutes will just burn calls against your hourly quota.",
        "**Do not treat it as a permanent failure either.** It is not a reconnect and not a bad input. The post is fine; the timing is not.",
        "**Requeue for after the window frees.** If you track publish timestamps per account, you know exactly when the next slot opens — requeue for then.",
        "**Tell the user what happened.** “Instagram's daily publishing limit was reached; this post is queued for 09:14 tomorrow” is a useful message. “Publish failed” is not.",
      ],
    },
    {
      type: "heading",
      text: "The other limits",
    },
    {
      type: "table",
      columns: ["Limit", "Value", "What it constrains"],
      rows: [
        [
          "Publishing",
          "Rolling 24h per account (assume 25)",
          "Successful publishes. The one people hit.",
        ],
        [
          "Unpublished containers",
          "~50 at once",
          "Media containers created but not yet published. Matters for bulk scheduling.",
        ],
        [
          "API calls",
          "~200/hour per user token",
          "All calls, including the status polls. Polling too aggressively can exhaust this.",
        ],
        [
          "Scheduled container window",
          "10 minutes to 75 days",
          "How far ahead a container can be scheduled server-side.",
        ],
        [
          "Carousel items",
          "20 per post",
          "Each item is its own container creation.",
        ],
      ],
    },
    {
      type: "callout",
      title: "The polling trap",
      text: "Video containers can take minutes to process. Polling `status_code` every second against a 200-calls-per-hour budget exhausts your quota in under four minutes — and then you cannot publish the thing you were waiting for. Poll with backoff: a few seconds initially, widening to 15–30 seconds.",
    },
    {
      type: "heading",
      text: "Designing a publisher around this",
    },
    {
      type: "subheading",
      text: "Track publishes per account, not per app",
    },
    {
      type: "paragraph",
      text: "Keep a per-account record of publish timestamps over the last 24 hours. You can then answer “can this account publish right now?” before making a call, and compute the exact time the next slot opens. Checking beforehand is far better than discovering it from an error.",
    },
    {
      type: "subheading",
      text: "Spread bulk schedules",
    },
    {
      type: "paragraph",
      text: "If a user uploads 40 images to schedule, do not offer to publish them all on Tuesday. Spread across days. Social0's [bulk image tools](/tools/bulk-image) distribute uploads across a date range by design, which sidesteps the cap rather than colliding with it.",
    },
    {
      type: "subheading",
      text: "Count carousels correctly",
    },
    {
      type: "paragraph",
      text: "A 10-image carousel is 11 container creations but **one** publish. It costs one slot against the publishing cap and eleven against your hourly call budget. Conflating the two budgets leads to wrong capacity estimates in both directions.",
    },
    {
      type: "subheading",
      text: "Isolate accounts",
    },
    {
      type: "paragraph",
      text: "One account hitting its cap must not affect the others. This is the same principle as per-platform fan-out: a post going to five accounts is five independent outcomes, and one being rate-limited should not fail the other four.",
    },
    {
      type: "cta",
      text: "Per-account publishing that isolates failures and spreads bulk schedules.",
      href: "/features/instagram-scheduler",
      label: "See the Instagram scheduler",
    },
    {
      type: "heading",
      text: "Limits are not the only reason a publish fails",
    },
    {
      type: "paragraph",
      text: "Before you conclude you are rate-limited, rule out the more common causes:",
    },
    {
      type: "list",
      items: [
        "**Account type.** Publishing requires a Business or Creator account. A personal account returns permission errors that look unrelated.",
        "**Expired token.** Meta's long-lived tokens last around 60 days. An expired one is a 401 and needs reconnection, not a retry.",
        "**Media not reachable.** Meta fetches your media from the URL you supply. If that URL is not publicly reachable, container creation fails.",
        "**Video too long or too large.** Covered in [social media video specs](/blog/social-media-video-specs).",
        "**Aspect ratio out of range.** Instagram accepts roughly 1.91:1 to 4:5 for feed posts and rejects outside that.",
      ],
    },
    {
      type: "paragraph",
      text: "A publisher that distinguishes these five from each other — and from a rate limit — turns an opaque “failed” into an actionable message. That distinction is most of what separates a tool people trust from one they check manually every morning.",
    },
  ],
  faq: [
    {
      question: "How many posts can you publish to Instagram per day via API?",
      answer:
        "The widely cited figure is 25 per Instagram Professional account in a rolling 24-hour period, though Meta's documentation has stated 25, 50, and 100 at different times. Build against 25 — the conservative number — because exceeding the real limit surfaces as a production failure.",
    },
    {
      question: "What is Instagram API error code 9?",
      answer:
        "The publishing limit for that account has been reached. Despite the message saying “application request limit”, it is account-level, not app-level. Do not retry immediately — requeue for after the rolling window frees a slot, which is 24 hours after the earliest publish in the window.",
    },
    {
      question: "Does the Instagram publishing limit reset at midnight?",
      answer:
        "No. It is a 24-hour moving window, so each publish frees its own slot exactly 24 hours later. Twenty-five posts at 09:00 Monday means you are blocked until 09:00 Tuesday, not until Tuesday midnight.",
    },
    {
      question: "Do Instagram carousel posts count as multiple posts?",
      answer:
        "No. A carousel is one publish against the publishing cap regardless of how many images it contains. It does however cost one API call per item for container creation, which counts against the separate hourly call quota.",
    },
    {
      question: "Do posts made manually in the Instagram app count toward the API limit?",
      answer:
        "No. The publishing cap applies only to posts published through the Content Publishing API. Manual posts in the app and Stories are tracked separately.",
    },
  ],
  relatedPaths: [
    { href: "/features/instagram-scheduler", label: "Instagram scheduler" },
    { href: "/tools/bulk-image", label: "Bulk image scheduling" },
    { href: "/tools/api", label: "REST API" },
  ],
  relatedSlugs: [
    "social-media-posting-api-guide",
    "why-scheduled-posts-fail",
    "social-media-video-specs",
  ],
};
