import type { BlogPost } from "../blog-types";

export const tiktokAlgorithmGuide: BlogPost = {
  slug: "tiktok-algorithm-guide",
  category: "Strategy",
  metaTitle: "How the TikTok Algorithm Works in 2026 (For You Page Ranking)",
  metaDescription:
    "Watch time per impression is now the dominant signal, shares and saves outweigh likes, and the follower test phase still gates everything. How TikTok ranks video, and what that means for length.",
  keywords: [
    "tiktok algorithm",
    "how tiktok algorithm works",
    "for you page algorithm",
    "tiktok watch time completion rate",
    "tiktok reach 2026",
  ],
  title: "How the TikTok algorithm works in 2026",
  excerpt:
    "TikTok stopped counting views and started counting attention. Watch time per impression now drives distribution — which changes the optimal video length in a way most advice hasn't caught up with.",
  datePublished: "2026-09-20",
  readingMinutes: 9,
  body: [
    {
      type: "paragraph",
      text: "TikTok remains the one major platform where an account with no followers can reach a million people, because distribution is decided by the content rather than the audience. That has not changed. What has changed is *which* attention metric it optimises.",
    },
    {
      type: "heading",
      text: "The test phase",
    },
    {
      type: "paragraph",
      text: "Every upload goes to a small initial audience first — and notably, that test group still leans on your **existing followers**. TikTok watches what they do. Strong signals earn a wider push, then a wider one again. Weak signals and the video stops.",
    },
    {
      type: "paragraph",
      text: "This is the part people get wrong about “followers don't matter on TikTok”. They matter less for *eventual* reach than anywhere else, but they are still the gate: a video your own audience abandons rarely escapes the test phase. Making content your existing followers finish is how you buy a ticket to everyone else.",
    },
    {
      type: "heading",
      text: "The signal hierarchy",
    },
    {
      type: "table",
      caption: "Roughly in order of weight, based on what TikTok and published analyses describe.",
      columns: ["Signal", "Weight", "Notes"],
      rows: [
        [
          "Watch time & completion rate",
          "Dominant — commonly estimated at 40–50% of ranking weight",
          "The single biggest factor by a wide margin.",
        ],
        ["Replays", "Very high", "A rewatch is the strongest possible attention signal."],
        ["Shares", "High", "Now weighted above likes. Sends the video off-platform or to a friend."],
        ["Saves", "High", "Signals lasting value. Also above likes."],
        ["Comments", "Moderate", "Especially when you reply and start a thread."],
        ["Likes", "Low", "The cheapest action, weighted accordingly."],
        ["Negative feedback", "Strongly negative", "“Not interested”, skips, and reports suppress hard."],
      ],
    },
    {
      type: "callout",
      title: "The change that matters most",
      text: "**Watch time per impression has replaced raw view count** as the primary signal. TikTok is no longer asking “how many people saw this?” but “how much attention did each impression produce?” Total views are now closer to an output than an input.",
    },
    {
      type: "heading",
      text: "Why this makes longer videos viable",
    },
    {
      type: "paragraph",
      text: "This is the counterintuitive part, and it contradicts a lot of still-circulating advice.",
    },
    {
      type: "paragraph",
      text: "Under a pure *completion rate* model, short wins — a 15-second video is easier to finish than a 60-second one. But under **watch time per impression**, total seconds held matter. A 60-second video watched to 80% delivers 48 seconds of attention per impression. A 15-second video watched to 95% delivers 14. The longer video wins on distribution despite the worse completion rate.",
    },
    {
      type: "table",
      columns: ["Video", "Completion", "Attention per impression", "Distribution"],
      rows: [
        ["15 seconds", "95%", "~14 seconds", "Lower"],
        ["60 seconds", "80%", "~48 seconds", "Higher"],
        ["60 seconds", "25%", "~15 seconds", "Comparable to the 15s clip"],
      ],
    },
    {
      type: "paragraph",
      text: "The honest reading: **make videos as long as you can hold attention, and not one second longer.** Padding a video to 60 seconds collapses the retention curve and you end up worse off than the short version. The skill is earning the duration, not choosing it.",
    },
    {
      type: "heading",
      text: "The first two seconds",
    },
    {
      type: "paragraph",
      text: "Watch time in the opening moments is the strongest early predictor, because that is where most abandonment happens. Everything about the first frame is doing work:",
    },
    {
      type: "list",
      items: [
        "**Start mid-action.** No logo, no “hey guys”, no throat-clearing. The first frame should already be the thing.",
        "**Put the premise on screen immediately.** People decide whether this concerns them before they have processed any audio.",
        "**Avoid a slow visual ramp.** A static opening frame reads as skippable.",
        "**Design for mute.** Most first views have no sound. Burned-in captions are not optional.",
      ],
    },
    {
      type: "callout",
      title: "Replays are the cheat code",
      text: "A rewatch counts the full duration again. Videos that loop cleanly — where the last frame flows into the first — or that contain a detail people go back for, can post watch-time rates above 100%. This is the most under-exploited mechanic on the platform.",
    },
    {
      type: "heading",
      text: "What suppresses reach",
    },
    {
      type: "list",
      items: [
        "**Watermarks from other platforms.** TikTok discounts content carrying another network's watermark, exactly as Meta does in reverse. Export clean masters.",
        "**Low resolution.** TikTok's posting API expects vertical 9:16 at 720×1280 or better; below that gets rejected or looks poor enough to lose retention.",
        "**Negative feedback.** “Not interested” and rapid skips suppress hard. Clickbait that does not deliver generates both.",
        "**Reposting without transformation.** Aggregated content performs poorly and risks the account.",
      ],
    },
    {
      type: "heading",
      text: "Where timing fits",
    },
    {
      type: "paragraph",
      text: "Less than anywhere else. Because TikTok surfaces content well beyond the hour it was posted, and can resurface videos weeks later, posting time is the weakest lever in this guide. Evening windows perform somewhat better, but a good video posted at a mediocre hour will still find its audience.",
    },
    {
      type: "paragraph",
      text: "What matters far more is **consistency** — a steady stream gives the algorithm more chances to find the one that breaks out. That is a scheduling problem more than a creative one: filming several videos in one session and spreading them across two weeks is more sustainable than trying to produce daily. [Bulk video tools](/tools/bulk-video) exist for exactly this.",
    },
    {
      type: "cta",
      text: "Batch-upload videos and spread them across a schedule.",
      href: "/features/tiktok-scheduler",
      label: "See the TikTok scheduler",
    },
    {
      type: "heading",
      text: "A working approach",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Open mid-action**, with the premise visible in frame one and captions burned in.",
        "**Run as long as you can genuinely hold**, rather than cutting to a target length.",
        "**Build in a reason to rewatch** — a clean loop, or a detail that rewards a second pass.",
        "**Optimise for shares and saves**, which now outweigh likes.",
        "**Reply to comments in the first hour** to start threads.",
        "**Post consistently** and let volume do the searching. Timing is the least of your levers here.",
      ],
    },
    {
      type: "paragraph",
      text: "TikTok is the most meritocratic of the major feeds and the least forgiving. Nobody can buy their way past a bad retention curve, and nobody's follower count protects them from one.",
    },
  ],
  faq: [
    {
      question: "How does the TikTok algorithm work in 2026?",
      answer:
        "Every video is shown to a small test audience first, weighted toward your existing followers. TikTok measures the response — primarily watch time and completion rate, which are estimated to carry 40–50% of the ranking weight — and expands distribution if the signals are strong.",
    },
    {
      question: "What is the most important TikTok ranking signal?",
      answer:
        "Watch time, specifically watch time per impression, which has replaced raw view count as the primary signal. Replays count the full duration again and are the strongest single signal available. Shares and saves now outweigh likes.",
    },
    {
      question: "How long should TikTok videos be in 2026?",
      answer:
        "As long as you can genuinely hold attention. Because ranking uses watch time per impression rather than completion rate alone, a 60-second video watched to 80% out-distributes a 15-second video watched to 95%. But padding collapses retention, so the length has to be earned.",
    },
    {
      question: "Do followers matter on TikTok?",
      answer:
        "Less than on any other platform for eventual reach, but they still gate it. The initial test audience leans on your existing followers, so a video your own audience abandons rarely escapes that phase to reach anyone else.",
    },
    {
      question: "Does posting time matter on TikTok?",
      answer:
        "Less than on any other network. TikTok surfaces content well beyond the hour it was posted and can resurface videos weeks later. Evening windows perform somewhat better, but consistency and retention matter far more than the timestamp.",
    },
  ],
  relatedPaths: [
    { href: "/features/tiktok-scheduler", label: "TikTok scheduler" },
    { href: "/tools/bulk-video", label: "Bulk video tools" },
  ],
  relatedSlugs: [
    "reels-vs-tiktok-vs-shorts",
    "instagram-algorithm-guide",
    "social-media-video-specs",
  ],
};
