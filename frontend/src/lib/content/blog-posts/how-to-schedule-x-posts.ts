import type { BlogPost } from "../blog-types";

export const howToScheduleXPosts: BlogPost = {
  slug: "how-to-schedule-x-posts",
  category: "Platform specs",
  metaTitle: "How to Schedule Tweets and X Posts (Web, App and Threads)",
  metaDescription:
    "Schedule posts on X from x.com, find your unsent scheduled posts, why threads are the catch, and how Premium's longer posts change scheduling across networks.",
  keywords: [
    "how to schedule tweets",
    "how to schedule posts on x",
    "schedule tweets",
    "twitter scheduler",
    "schedule a thread on x",
    "x scheduled posts",
    "schedule tweets on mobile",
  ],
  title: "How to schedule posts on X (tweets and threads)",
  excerpt:
    "X has a built-in scheduler on the web, and it is starting to reach the iPhone app. It handles single posts well and threads badly. Here is the native flow, where your scheduled posts hide, and when a scheduler is the better route.",
  datePublished: "2026-11-26",
  readingMinutes: 7,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** on **x.com**, write your post, click the **calendar-and-clock icon** under the text box, pick a date and time, click **Confirm**, then **Schedule**. It is free and works for any account. To see what's queued, open the same icon and choose **Scheduled posts**.",
    },
    {
      type: "heading",
      text: "Schedule a post on x.com",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Open **x.com** in a desktop or mobile browser and click **Post** (or use the box at the top of your home timeline).",
        "Write the post and add images, a video or a GIF.",
        "Click the **schedule icon** (a calendar with a clock) in the row of icons under the text.",
        "Pick the date, time and time zone, and click **Confirm**.",
        "The Post button changes to **Schedule**. Click it.",
      ],
    },
    {
      type: "paragraph",
      text: "The date picker goes well over a year ahead, so the window is not the problem; remembering what you queued is.",
    },
    {
      type: "subheading",
      text: "Where scheduled posts hide",
    },
    {
      type: "paragraph",
      text: "Scheduled posts don't appear on your profile or in the app's drafts. On x.com, open the composer, click the schedule icon, and choose **Scheduled posts** (some layouts call this **Unsent posts**). From there you can open a post to edit it, change its time, or delete it.",
    },
    {
      type: "heading",
      text: "Can you schedule on the X mobile app?",
    },
    {
      type: "paragraph",
      text: "For years the answer was no. In September 2026 X began rolling scheduling out in the **iPhone app**, but not to every account, and reports at the time found no sign of it on **Android**. If you don't see a schedule option in your app's composer, open x.com in your phone's browser: the web scheduler works there.",
    },
    {
      type: "heading",
      text: "The catch: threads",
    },
    {
      type: "paragraph",
      text: "X's scheduler is built for single posts. As soon as you add a second post to make a thread, the schedule option is no longer offered in most versions of the composer. The usual workaround is to schedule post 1 and reply with the rest by hand, which defeats the point.",
    },
    {
      type: "paragraph",
      text: "Schedulers that publish through the **X API** can post a whole thread in order at the scheduled time. If threads are your main format, this is the strongest reason to use one.",
    },
    {
      type: "callout",
      title: "Write the thread first",
      text: "Paste a long draft into the [free thread maker](/free-tools/twitter-thread-maker): it splits the text into numbered posts under 280 characters at sentence breaks, and can send them all to Social0 to schedule as one thread.",
    },
    {
      type: "heading",
      text: "Premium, long posts and cross-posting",
    },
    {
      type: "paragraph",
      text: "Standard accounts get **280 characters**; Premium accounts can post up to **25,000**. That gap matters when the same text also goes elsewhere: a 1,200-character X post is fine with Premium but has to be cut to 300 for Bluesky and 500 for Threads. Check how a post counts with the [X character counter](/free-tools/post-preview/x), which also shows the Premium limit. Note that X counts links as 23 characters and most emoji as 2. [The character limits guide](/blog/social-media-character-limits) has the full table.",
    },
    {
      type: "subheading",
      text: "Scheduling X in Social0",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Connect X with X's official sign-in. Social0 detects Premium and applies the longer limit automatically.",
        "Write a single post or a thread, with images or video, and select X along with any other networks. X can keep a short version while LinkedIn gets a longer one.",
        "Optionally mark the post **Made with AI** or as a **paid partnership** so X shows the label.",
        "Pick a time, add it to your posting queue, or post now.",
      ],
    },
    {
      type: "cta",
      text: "Schedule X threads with Threads, Bluesky and LinkedIn from one composer. Free plan, no credit card.",
      href: "/features/twitter-scheduler",
      label: "See the X scheduler",
    },
    {
      type: "heading",
      text: "Does scheduling hurt reach on X?",
    },
    {
      type: "paragraph",
      text: "There is no public evidence that X ranks scheduled posts lower. What X's ranking does reward is early replies and conversation, so schedule for a time when you can be around to answer. [The X algorithm guide](/blog/x-algorithm-guide) covers what X ranks, and [the best time to post guide](/blog/best-time-to-post-on-social-media) has a starting point for timing.",
    },
  ],
  faq: [
    {
      question: "How do I schedule a tweet?",
      answer:
        "On x.com, write the post, click the calendar-and-clock icon under the text, pick a date and time, click Confirm, then Schedule. It's free for every account.",
    },
    {
      question: "Where do I find my scheduled posts on X?",
      answer:
        "On x.com, open the composer, click the schedule icon and choose Scheduled posts (sometimes labelled Unsent posts). They don't show on your profile or in the app's drafts.",
    },
    {
      question: "Can you schedule a thread on X?",
      answer:
        "Not reliably with X's own scheduler, which is built for single posts. A scheduler that uses the X API, such as Social0, can publish a whole thread in order at the scheduled time.",
    },
    {
      question: "Can you schedule posts in the X app?",
      answer:
        "X started rolling out scheduling in the iPhone app in September 2026, not yet for every account, and not on Android. Otherwise use x.com in your phone's browser.",
    },
    {
      question: "Do scheduled tweets get less reach?",
      answer:
        "There's no public evidence of that. Replies and conversation in the first hour matter more, so schedule for a time when you can respond.",
    },
  ],
  relatedPaths: [
    { href: "/features/twitter-scheduler", label: "X scheduler" },
    { href: "/free-tools/twitter-thread-maker", label: "Free thread maker" },
    { href: "/free-tools/post-preview/x", label: "X character counter" },
  ],
  relatedSlugs: [
    "x-algorithm-guide",
    "how-to-schedule-bluesky-posts",
    "how-to-schedule-threads-posts",
  ],
};
