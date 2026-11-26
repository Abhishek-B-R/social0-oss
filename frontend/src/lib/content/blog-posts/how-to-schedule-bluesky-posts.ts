import type { BlogPost } from "../blog-types";

export const howToScheduleBlueskyPosts: BlogPost = {
  slug: "how-to-schedule-bluesky-posts",
  category: "Platform specs",
  metaTitle: "Can You Schedule Posts on Bluesky? How to Do It (2026)",
  metaDescription:
    "Bluesky has drafts but no built-in scheduler. How to schedule Bluesky posts with an app password, keep it safe, schedule threads, and post alongside X and Threads.",
  keywords: [
    "how to schedule bluesky posts",
    "can you schedule posts on bluesky",
    "schedule bluesky posts",
    "bluesky scheduler",
    "bluesky scheduling tool",
    "bluesky app password",
  ],
  title: "Can you schedule posts on Bluesky? Yes, here is how",
  excerpt:
    "Bluesky's app has drafts but no way to pick a future publish time. Scheduling works through tools that connect with an app password. Here is how that works, how to keep it safe, and how to schedule Bluesky with X and Threads.",
  datePublished: "2026-11-26",
  readingMinutes: 6,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** not inside the Bluesky app. Bluesky added **drafts** in February 2026, but there is still no option to choose a future publish time. To schedule, connect a scheduling tool to your account with a Bluesky **app password**, then write the post there and pick a time.",
    },
    {
      type: "heading",
      text: "Why Bluesky scheduling works differently",
    },
    {
      type: "paragraph",
      text: "Bluesky runs on the open AT Protocol. Instead of a \"Sign in with Bluesky\" button like Meta's or X's, third-party apps usually connect with an **app password**: a separate password you create just for that app. It can post for you but can't change your main login, and you can revoke it at any time without touching your real password.",
    },
    {
      type: "heading",
      text: "Step 1: create an app password",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "In Bluesky, open **Settings → Privacy and security → App passwords**.",
        "Click **Add App Password** and name it after the tool (for example \"Social0\"), so you know what to revoke later.",
        "Leave **direct message access** off unless the tool needs it. Scheduling doesn't.",
        "Copy the password. Bluesky shows it only once.",
      ],
    },
    {
      type: "callout",
      title: "Never paste your main password",
      text: "A scheduler should only ever ask for your **handle and an app password**. If a tool asks for your main Bluesky password, don't use it. If you stop using a tool, delete its app password in the same settings screen.",
    },
    {
      type: "heading",
      text: "Step 2: connect and schedule",
    },
    {
      type: "paragraph",
      text: "In Social0:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Go to Connections, choose **Bluesky**, and enter your handle and the app password. Social0 stores it encrypted and uses it only to publish.",
        "Write the post, or a thread, with images or video. The composer counts against Bluesky's **300-character** limit.",
        "Select Bluesky together with X, Threads or anything else, and give Bluesky its own caption if the other networks get longer text.",
        "Pick a time, add it to your posting queue, or post now.",
      ],
    },
    {
      type: "cta",
      text: "Schedule Bluesky with X, Threads and LinkedIn from one composer. Free plan, no credit card.",
      href: "/features/bluesky-scheduling-tool",
      label: "See the Bluesky scheduler",
    },
    {
      type: "heading",
      text: "Scheduling threads on Bluesky",
    },
    {
      type: "paragraph",
      text: "With a 300-character limit, longer thoughts on Bluesky become threads. A scheduler that posts through the AT Protocol can publish the whole chain in order at the scheduled time. To split a long draft, paste it into the [free thread maker](/free-tools/twitter-thread-maker) and switch it to Bluesky: it breaks the text into numbered posts under 300 characters at sentence breaks.",
    },
    {
      type: "heading",
      text: "Posting the same thing to Bluesky, X and Threads",
    },
    {
      type: "paragraph",
      text: "Most people on Bluesky also post on X and Threads. The limits are close but not equal: **280** on X, **300** on Bluesky, **500** on Threads. Link previews also behave differently on each; check a link with the [link preview checker](/free-tools/link-preview-checker) before scheduling. [Bluesky and Threads for brands](/blog/bluesky-and-threads-for-brands) covers how the audiences differ, and [cross-posting vs repurposing](/blog/cross-posting-vs-repurposing) covers when to post the same words and when to rewrite.",
    },
    {
      type: "paragraph",
      text: "Check how a post will look with the [Bluesky post preview](/free-tools/post-preview/bluesky).",
    },
    {
      type: "heading",
      text: "Does scheduling affect Bluesky reach?",
    },
    {
      type: "paragraph",
      text: "Bluesky's default Following feed is chronological, and Discover and custom feeds are built by their own algorithms. A scheduled post arrives as a normal post from your account, so there's no reason for it to be treated differently. Timing matters more on a chronological feed, so schedule for when your followers are online.",
    },
  ],
  faq: [
    {
      question: "Can you schedule posts on Bluesky?",
      answer:
        "Not in the Bluesky app, which has drafts but no scheduler. You can schedule through a third-party tool such as Social0 that connects with a Bluesky app password.",
    },
    {
      question: "Is it safe to give a scheduler my Bluesky app password?",
      answer:
        "An app password can post for you but can't change your main login, and you can revoke it at any time in Settings → Privacy and security → App passwords. Never give any tool your main password.",
    },
    {
      question: "Can I schedule a Bluesky thread?",
      answer:
        "Yes, with a scheduler that supports threads. Social0 publishes the posts of a thread in order at the scheduled time.",
    },
    {
      question: "What is the character limit on Bluesky?",
      answer:
        "300 characters per post. Longer text has to be split into a thread.",
    },
    {
      question: "Does Bluesky have drafts?",
      answer:
        "Yes, since February 2026. Drafts save a post to finish later but don't publish it at a set time.",
    },
  ],
  relatedPaths: [
    { href: "/features/bluesky-scheduling-tool", label: "Bluesky scheduler" },
    { href: "/free-tools/twitter-thread-maker", label: "Free thread maker" },
    { href: "/free-tools/post-preview/bluesky", label: "Bluesky post preview" },
  ],
  relatedSlugs: [
    "bluesky-and-threads-for-brands",
    "how-to-schedule-x-posts",
    "how-to-schedule-threads-posts",
  ],
};
