import type { BlogPost } from "../blog-types";

export const howToScheduleTiktokPosts: BlogPost = {
  slug: "how-to-schedule-tiktok-posts",
  category: "Platform specs",
  metaTitle: "How to Schedule TikTok Posts (2026): Native and API Options",
  metaDescription:
    "How to schedule TikTok videos and photo posts in 2026: TikTok Studio on desktop, its 10-day window, what a third-party scheduler adds, and the API rules behind it.",
  keywords: [
    "how to schedule tiktok posts",
    "schedule tiktok posts",
    "tiktok scheduler",
    "can you schedule tiktok posts",
    "schedule tiktok on mobile",
    "tiktok post scheduler",
    "tiktok scheduling tool",
  ],
  title: "How to schedule TikTok posts in 2026",
  excerpt:
    "TikTok has a built-in scheduler, but it lives on desktop, looks only a few days ahead and cannot edit a post once it is queued. Here is how to use it, where it stops, and what a scheduler built on TikTok's API changes.",
  datePublished: "2026-11-26",
  readingMinutes: 8,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** yes, you can schedule TikTok posts. TikTok's own scheduler is in **TikTok Studio on desktop** (tiktok.com in a browser). Upload the video, switch on **Schedule**, pick a date and time, and post. For phone scheduling, more lead time, or one upload that also goes to Reels and Shorts, use a scheduler that publishes through TikTok's Content Posting API.",
    },
    {
      type: "paragraph",
      text: "The rest of this guide covers both routes step by step, the limits that catch people out, and how to choose a third-party tool that will not quietly post everything as private.",
    },
    {
      type: "heading",
      text: "Option 1: schedule in TikTok Studio (desktop)",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Open **tiktok.com** on a computer, sign in, and go to **TikTok Studio → Upload** (or click the Upload button).",
        "Drop in your video or photos. Wait for the upload to finish before you edit anything.",
        "Write the caption, pick a cover, and set who can watch, comment, Duet and Stitch.",
        "Under **When to post**, choose **Schedule** and pick the date and time. The time follows your computer's time zone.",
        "Click **Schedule**. The post now sits in your Studio content list until it goes live.",
      ],
    },
    {
      type: "callout",
      title: "How far ahead can you schedule?",
      text: "TikTok's announcement of the scheduler gave a window of **15 minutes to 10 days**. Some accounts now report a longer window in the date picker, up to 30 days, so treat 10 days as the safe floor and check what your account offers. Either way, it is not built for planning a month of content in one sitting.",
    },
    {
      type: "subheading",
      text: "What the native scheduler cannot do",
    },
    {
      type: "list",
      items: [
        "**No edits after scheduling.** You cannot change the video, caption or time of a queued post. To fix a typo you delete it and upload again.",
        "**Desktop first.** The main TikTok app has no scheduler. Scheduling lives in TikTok Studio, and phone support depends on your account and region.",
        "**One network.** It only posts to TikTok. The same clip still has to be uploaded separately to Instagram Reels, YouTube Shorts and anywhere else.",
        "**Account type matters.** TikTok first launched scheduling for Business accounts. Most creator accounts have it now, but if you do not see the option, check **Settings → Account** for your account type.",
      ],
    },
    {
      type: "heading",
      text: "Option 2: schedule with a tool built on TikTok's API",
    },
    {
      type: "paragraph",
      text: "Third-party schedulers publish through TikTok's **Content Posting API**. That is the same pipe TikTok offers every approved app, so the differences between tools come down to how much of it they expose and how well they handle failures.",
    },
    {
      type: "paragraph",
      text: "The API has two modes, and it helps to know which one a tool uses:",
    },
    {
      type: "table",
      caption: "TikTok Content Posting API modes",
      columns: ["Mode", "What happens", "Good for"],
      rows: [
        ["Direct Post", "The video publishes to your profile at the scheduled time", "Hands-off scheduling"],
        ["Upload (draft)", "The video lands in your TikTok inbox; you finish it in the app and post", "Adding trending sounds, effects or stickers before it goes live"],
      ],
    },
    {
      type: "callout",
      title: "Check this before you pick a tool",
      text: "TikTok restricts apps that have not passed its API audit to **private-only posts**. If a tool's posts keep showing up as Only me, that is usually why. A tool that offers Public, Friends and Followers privacy options has passed the audit.",
    },
    {
      type: "subheading",
      text: "Scheduling TikTok in Social0",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Connect your TikTok account. Social0 uses TikTok Login Kit, the official sign-in.",
        "Open the composer, add your video or photos, and select your TikTok account. Add Instagram, YouTube and the rest in the same post if you want.",
        "Open the TikTok panel: set an optional title (up to 85 characters), privacy, comments, Duet, Stitch and the commercial content disclosure. Switch on **Send to TikTok as draft** if you want to finish it in the app.",
        "Pick a time on the calendar, or post now.",
      ],
    },
    {
      type: "paragraph",
      text: "TikTok photo posts do not accept PNG; Social0 converts PNGs to JPEG for you. You can also give TikTok its own caption while the other networks get a different one.",
    },
    {
      type: "cta",
      text: "Schedule TikTok, Reels and Shorts from one upload. Free plan, no credit card.",
      href: "/features/tiktok-scheduler",
      label: "See the TikTok scheduler",
    },
    {
      type: "heading",
      text: "Get the video right before you schedule it",
    },
    {
      type: "paragraph",
      text: "Most failed TikTok posts are not scheduling problems. They are file problems that only show up at publish time. Check these before you queue anything:",
    },
    {
      type: "list",
      items: [
        "**Vertical 9:16, 1080 × 1920.** Landscape uploads get letterboxed and look out of place in the feed. The [free video resizer](/free-tools/video-resizer) turns a 16:9 clip into 9:16 with a blurred fill, right in your browser.",
        "**MP4 or MOV, H.264.** Full specs for every network are in [the social media video specs guide](/blog/social-media-video-specs).",
        "**Caption length.** Check it against TikTok's limit, and against every other network you are cross-posting to, with the [TikTok caption counter](/free-tools/post-preview/tiktok).",
        "**Hook in the first second.** Scheduling does not change how the feed ranks a video. [The TikTok algorithm guide](/blog/tiktok-algorithm-guide) covers what does.",
      ],
    },
    {
      type: "heading",
      text: "Does scheduling hurt TikTok reach?",
    },
    {
      type: "paragraph",
      text: "There is no public evidence that TikTok ranks scheduled or API-published videos lower than ones posted by hand. Through the Content Posting API, the video arrives as a normal post from your account. What does change reach is what you can only do in the app: trending sounds you add in the editor, and replying to comments in the first hour. If a post depends on a trending sound, use the draft mode and add the sound in the app before it goes live.",
    },
    {
      type: "heading",
      text: "When to post",
    },
    {
      type: "paragraph",
      text: "Scheduling only helps if you pick good times. Start from the platform defaults in [the best time to post guide](/blog/best-time-to-post-on-social-media), then move toward the hours your own TikTok analytics show your followers are active. Consistency beats perfect timing: a steady three posts a week tends to do more than a burst of ten followed by silence.",
    },
  ],
  faq: [
    {
      question: "Can you schedule TikTok posts on your phone?",
      answer:
        "Not in the main TikTok app. TikTok's scheduler is in TikTok Studio, which is reliable on desktop. To schedule from a phone, use a scheduler that publishes through TikTok's Content Posting API, such as Social0.",
    },
    {
      question: "How far in advance can you schedule a TikTok?",
      answer:
        "TikTok's native scheduler launched with a window of 15 minutes to 10 days, and some accounts now see up to 30 days. Third-party schedulers that use the API can queue posts further out because they publish at the chosen time themselves.",
    },
    {
      question: "Can I edit a scheduled TikTok post?",
      answer:
        "Not in TikTok's native scheduler. You have to delete the scheduled post and upload it again. In a third-party scheduler you can usually edit the post freely until it publishes.",
    },
    {
      question: "Why do my scheduled TikToks post as private?",
      answer:
        "TikTok limits apps that have not passed its Content Posting API audit to private-only posts. Use a tool that offers Public, Friends and Followers privacy options, or check the privacy setting on the post itself.",
    },
    {
      question: "Can I schedule TikTok photo posts and carousels?",
      answer:
        "Yes, through the Content Posting API. TikTok photo posts do not accept PNG; Social0 converts PNG files to JPEG automatically.",
    },
  ],
  relatedPaths: [
    { href: "/features/tiktok-scheduler", label: "TikTok scheduler" },
    { href: "/free-tools/video-resizer", label: "Free video resizer" },
    { href: "/free-tools/post-preview/tiktok", label: "TikTok caption counter" },
  ],
  relatedSlugs: [
    "how-to-schedule-youtube-videos",
    "tiktok-algorithm-guide",
    "reels-vs-tiktok-vs-shorts",
  ],
};
