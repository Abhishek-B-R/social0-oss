import type { BlogPost } from "../blog-types";

export const howToScheduleThreadsPosts: BlogPost = {
  slug: "how-to-schedule-threads-posts",
  category: "Platform specs",
  metaTitle: "How to Schedule Threads Posts (Meta Threads Scheduling Guide)",
  metaDescription:
    "How to schedule posts on Meta's Threads: the built-in scheduler, how far ahead it goes, why replies and multi-post threads are the catch, and scheduling alongside X.",
  keywords: [
    "how to schedule threads posts",
    "schedule threads posts",
    "meta threads scheduling",
    "threads scheduler",
    "schedule meta threads",
    "can you schedule posts on threads",
  ],
  title: "How to schedule Threads posts",
  excerpt:
    "Threads has had a native scheduler since early 2025. It handles single posts well, but it can't schedule replies, so a chain of posts is harder than it should be. Here is the native flow, the catch, and how to schedule Threads next to X and Bluesky.",
  datePublished: "2026-11-26",
  readingMinutes: 6,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** yes, you can schedule posts on Threads. Write the post, open the **more (…) menu** in the composer, choose **Schedule**, pick a date and time, and confirm. Scheduled posts wait in your **Drafts**, where you can edit or delete them before they go out.",
    },
    {
      type: "paragraph",
      text: "Meta first shipped scheduling on Threads for the web in 2024 and rolled it out widely in January 2025. At that launch, reports gave a window of up to **75 days** ahead. Meta hasn't published a firm limit in its help pages, so check the date picker if you plan far out.",
    },
    {
      type: "heading",
      text: "Schedule a post on Threads",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Open **threads.com** (or the Threads app) and start a new post.",
        "Write the text and add images or a video.",
        "Open the composer's **…** menu and choose **Schedule**.",
        "Pick the date and time, then confirm with **Schedule**.",
      ],
    },
    {
      type: "paragraph",
      text: "To change or cancel it later, open your **Drafts**. Scheduled posts are listed there with their time, and you can edit, reschedule or delete them until they publish.",
    },
    {
      type: "heading",
      text: "The catch: replies and multi-post threads",
    },
    {
      type: "paragraph",
      text: "When scheduling launched, Meta's scheduler covered top-level posts only: **replies can't be scheduled**. That matters on Threads more than anywhere else, because long thoughts are usually posted as a chain: post 1, then replies 2, 3 and 4 under it.",
    },
    {
      type: "paragraph",
      text: "Natively, that leaves two options: post the whole chain by hand at the right moment, or schedule post 1 and add the rest by hand once it is live. Schedulers that publish through the **Threads API** don't have this limit, because the API lets them post the chain in order at the scheduled time.",
    },
    {
      type: "callout",
      title: "Split long text first",
      text: "Threads allows 500 characters per post. Paste a long draft into the [free thread maker](/free-tools/twitter-thread-maker), switch it to Threads, and it splits the text at sentence boundaries into numbered posts under the limit.",
    },
    {
      type: "heading",
      text: "Scheduling Threads with X and Bluesky",
    },
    {
      type: "paragraph",
      text: "Most people who post on Threads also post on X, Bluesky or both, and often the same idea with small changes. The limits differ: 280 characters on X, 300 on Bluesky and 500 on Threads. [The character limits guide](/blog/social-media-character-limits) has the full table, and [Bluesky and Threads for brands](/blog/bluesky-and-threads-for-brands) covers how the audiences differ.",
    },
    {
      type: "subheading",
      text: "Scheduling Threads in Social0",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Connect Threads with Meta's official sign-in. You can connect more than one Threads profile if your plan allows it.",
        "Write the post once, select Threads with X, Bluesky or anything else, and give Threads its own caption if you like.",
        "For a chain, build it as a thread in the composer. Social0 publishes the posts in order through the Threads API at the scheduled time.",
        "Pick a time, add it to your posting queue, or post now.",
      ],
    },
    {
      type: "cta",
      text: "Schedule Threads, X and Bluesky threads from one composer. Free plan, no credit card.",
      href: "/features/threads-scheduler",
      label: "See the Threads scheduler",
    },
    {
      type: "heading",
      text: "Check how it reads before you schedule",
    },
    {
      type: "paragraph",
      text: "Line breaks, links and length all look different in the feed than in a text editor. The [Threads post preview](/free-tools/post-preview/threads) shows the post as it will appear and counts characters against the 500 limit. Then pick a time using [the best time to post guide](/blog/best-time-to-post-on-social-media) as a starting point, and adjust once you have a few weeks of your own numbers.",
    },
  ],
  faq: [
    {
      question: "Can you schedule posts on Threads?",
      answer:
        "Yes. In the composer, open the more (…) menu, choose Schedule, and pick a date and time. Scheduled posts sit in your Drafts until they publish.",
    },
    {
      question: "How far in advance can you schedule a Threads post?",
      answer:
        "Reports at launch in January 2025 gave a window of up to 75 days. Meta hasn't documented a firm limit, so check the date picker in your account.",
    },
    {
      question: "Can you schedule a thread (multiple posts) on Threads?",
      answer:
        "Not fully with the native scheduler, because it can't schedule replies. A scheduler that uses the Threads API, such as Social0, can publish the whole chain in order at the scheduled time.",
    },
    {
      question: "How do I edit or delete a scheduled Threads post?",
      answer:
        "Open your Drafts. Scheduled posts are listed there, and you can edit, reschedule or delete them until they go live.",
    },
    {
      question: "Can I schedule the same post to Threads and X?",
      answer:
        "Not natively; each app has its own scheduler. Social0 lets you write once and schedule to Threads, X, Bluesky and six other networks, with a separate caption per network if needed.",
    },
  ],
  relatedPaths: [
    { href: "/features/threads-scheduler", label: "Threads scheduler" },
    { href: "/free-tools/twitter-thread-maker", label: "Free thread maker" },
    { href: "/free-tools/post-preview/threads", label: "Threads post preview" },
  ],
  relatedSlugs: [
    "bluesky-and-threads-for-brands",
    "how-to-schedule-linkedin-posts",
    "social-media-character-limits",
  ],
};
