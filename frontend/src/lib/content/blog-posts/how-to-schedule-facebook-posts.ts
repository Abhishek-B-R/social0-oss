import type { BlogPost } from "../blog-types";

export const howToScheduleFacebookPosts: BlogPost = {
  slug: "how-to-schedule-facebook-posts",
  category: "Platform specs",
  metaTitle: "How to Schedule Facebook Posts (Pages, Profiles and Groups)",
  metaDescription:
    "Schedule Facebook posts and Reels for a Page with Meta Business Suite, what works for profiles and groups, how far ahead you can go, and scheduling with Instagram.",
  keywords: [
    "how to schedule facebook posts",
    "schedule facebook posts",
    "facebook scheduler",
    "schedule post on facebook page",
    "meta business suite schedule post",
    "schedule facebook post on profile",
    "schedule facebook group post",
  ],
  title: "How to schedule Facebook posts (Pages, profiles and groups)",
  excerpt:
    "Facebook scheduling depends on what you're posting from. Pages get the full scheduler in Meta Business Suite; profiles and groups get much less. Here is each case, the limits, and when a scheduler that also covers Instagram and the rest makes sense.",
  datePublished: "2026-11-26",
  readingMinutes: 6,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** for a **Facebook Page**, open **Meta Business Suite**, click **Create post**, write it, then choose **Schedule** instead of Publish and pick a date and time. Reels and Stories can be scheduled the same way. Personal profiles and groups have more limited scheduling, covered below.",
    },
    {
      type: "heading",
      text: "Schedule a Page post in Meta Business Suite",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Go to **business.facebook.com** (or open the Meta Business Suite app) and select your Page.",
        "Click **Create post**. Tick Instagram too if you want the same post there.",
        "Add the text, photos or video, and a link if you need one.",
        "Under scheduling options, choose **Schedule**, then set the date and time.",
        "Click **Schedule**. The post appears in **Planner**, where you can drag it to a new time, edit it or delete it.",
      ],
    },
    {
      type: "callout",
      title: "How far ahead?",
      text: "Meta's window has changed over time; current guides cite anywhere from **29 to 75 days**. Check the date picker in your Business Suite rather than planning around one number.",
    },
    {
      type: "heading",
      text: "Profiles and groups",
    },
    {
      type: "list",
      items: [
        "**Personal profiles:** profiles with **professional mode** turned on get scheduling options in the post composer. Ordinary profiles have had little or no scheduling, and Meta's APIs don't let outside tools post to personal profiles at all.",
        "**Groups:** admins can schedule posts from inside the group's composer (look for the clock or schedule option). Third-party tools generally can't post to groups, because Meta closed that API.",
      ],
    },
    {
      type: "heading",
      text: "When Business Suite isn't enough",
    },
    {
      type: "paragraph",
      text: "Business Suite is free and handles Facebook and Instagram well. It doesn't cover anything else, so if the same post also goes to LinkedIn, X, TikTok or Threads, you're back to one scheduler per network. [Managing multiple social accounts](/blog/managing-multiple-social-accounts) covers when one calendar for everything pays off.",
    },
    {
      type: "subheading",
      text: "Scheduling Facebook in Social0",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Connect Facebook with Meta's official sign-in and choose your **Page**. Social0 publishes to Pages only; Meta doesn't let outside apps post to personal profiles.",
        "Write the post, add text, up to 20 images or a video, and select Facebook along with Instagram, LinkedIn or anything else.",
        "Give Facebook its own caption if it needs one, then pick a time, use a queue slot, or post now.",
      ],
    },
    {
      type: "cta",
      text: "Schedule your Facebook Page with Instagram, LinkedIn and X from one composer. Free plan, no credit card.",
      href: "/features/facebook-scheduler",
      label: "See the Facebook scheduler",
    },
    {
      type: "heading",
      text: "Before you schedule",
    },
    {
      type: "list",
      items: [
        "**Images:** 1200 × 630 for landscape and link posts, 1080 × 1080 for square. The [image resizer](/free-tools/image-resizer) exports both, plus Story and cover sizes.",
        "**Links:** check what the preview card will show with the [link preview checker](/free-tools/link-preview-checker). Facebook caches previews, so fix the page's tags before the post goes out.",
        "**Text length:** see how it reads with the [Facebook post preview](/free-tools/post-preview/facebook).",
        "**Timing:** start from [the best time to post guide](/blog/best-time-to-post-on-social-media), then use your Page's insights.",
      ],
    },
  ],
  faq: [
    {
      question: "How do I schedule a post on a Facebook Page?",
      answer:
        "In Meta Business Suite, click Create post, write the post, choose Schedule, pick a date and time, and click Schedule. It then appears in Planner.",
    },
    {
      question: "Can I schedule posts on my personal Facebook profile?",
      answer:
        "Only if professional mode is turned on, which adds scheduling to the composer. Third-party tools can't post to personal profiles because Meta's APIs don't allow it.",
    },
    {
      question: "Can I schedule posts in a Facebook group?",
      answer:
        "Group admins can schedule from inside the group. Outside schedulers generally can't post to groups, since Meta closed that API.",
    },
    {
      question: "How far in advance can I schedule a Facebook post?",
      answer:
        "It has changed over time; guides cite 29 to 75 days. Check the date picker in Meta Business Suite for your account.",
    },
    {
      question: "Can I schedule Facebook and Instagram at the same time?",
      answer:
        "Yes, in Meta Business Suite by ticking both accounts, or in Social0 alongside LinkedIn, X, TikTok and the other networks.",
    },
  ],
  relatedPaths: [
    { href: "/features/facebook-scheduler", label: "Facebook scheduler" },
    { href: "/free-tools/post-preview/facebook", label: "Facebook post preview" },
    { href: "/free-tools/link-preview-checker", label: "Link preview checker" },
  ],
  relatedSlugs: [
    "how-to-schedule-instagram-posts",
    "managing-multiple-social-accounts",
    "how-to-schedule-pinterest-pins",
  ],
};
