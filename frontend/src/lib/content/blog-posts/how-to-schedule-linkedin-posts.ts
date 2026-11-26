import type { BlogPost } from "../blog-types";

export const howToScheduleLinkedinPosts: BlogPost = {
  slug: "how-to-schedule-linkedin-posts",
  category: "Platform specs",
  metaTitle: "How to Schedule LinkedIn Posts: Profiles and Company Pages",
  metaDescription:
    "Schedule LinkedIn posts on desktop or mobile, for your profile or a company Page: the 3-month window, editing rules that differ for Pages, and the hook before 'more'.",
  keywords: [
    "how to schedule linkedin posts",
    "schedule linkedin posts",
    "linkedin scheduler",
    "linkedin post scheduler",
    "schedule post on linkedin company page",
    "edit scheduled linkedin post",
    "linkedin content scheduler",
  ],
  title: "How to schedule LinkedIn posts (profiles and company Pages)",
  excerpt:
    "LinkedIn has a built-in scheduler on desktop and mobile, up to three months ahead. The rules differ between your profile and a company Page, and that is where most people get stuck. Here is the full flow, plus when a scheduler is worth it.",
  datePublished: "2026-11-26",
  readingMinutes: 7,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** start a post, click the **clock icon** next to Post, pick a date and time up to **3 months** ahead, then click **Schedule**. It works on desktop and in the mobile app, for your personal profile and for company Pages you admin.",
    },
    {
      type: "paragraph",
      text: "The details that trip people up are the differences between profiles and Pages, and what you can change after a post is scheduled. Both are below.",
    },
    {
      type: "heading",
      text: "Schedule a post from your profile",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "On linkedin.com or in the app, click **Start a post**.",
        "Write the post and add images, a video or a document.",
        "Click the **clock icon** next to the Post button.",
        "Pick the date and time, then click **Next** and **Schedule**.",
      ],
    },
    {
      type: "paragraph",
      text: "LinkedIn's help page gives the window as **10 minutes to 3 months** from now. The time you pick follows your device's time zone.",
    },
    {
      type: "heading",
      text: "Schedule a post from a company Page",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Open your Page's **admin view**.",
        "Click **Create** → **Start a post**, and check the post is going out as the Page, not as you.",
        "Write the post, click the **clock icon**, and pick a time.",
        "Click **Schedule**.",
      ],
    },
    {
      type: "paragraph",
      text: "For Pages, LinkedIn says the time must be at least **one hour** away, up to three months ahead.",
    },
    {
      type: "heading",
      text: "Find, edit or reschedule a scheduled post",
    },
    {
      type: "paragraph",
      text: "Click the clock icon in the post box and choose **View all scheduled posts**. What you can do next depends on where the post lives:",
    },
    {
      type: "table",
      caption: "What you can change after scheduling (LinkedIn Help)",
      columns: ["", "Profile post", "Company Page post"],
      rows: [
        ["Change the time", "Yes", "Yes (desktop and iOS)"],
        ["Edit the text or media", "Yes", "No: delete it and schedule a new one"],
        ["Delete", "Yes", "Yes"],
        ["Minimum lead time", "10 minutes", "1 hour"],
        ["Maximum lead time", "3 months", "3 months"],
      ],
    },
    {
      type: "callout",
      title: "The Page trap",
      text: "Because Page posts can't be edited once scheduled, a typo found the night before means deleting the post and scheduling it again. Read the Page post once in a preview before you schedule it.",
    },
    {
      type: "heading",
      text: "Write the first two lines first",
    },
    {
      type: "paragraph",
      text: "The feed shows roughly **the first 210 characters** of a post before \"…more\". That is the only part most people read, so a scheduled post lives or dies on its hook. Two free tools help:",
    },
    {
      type: "list",
      items: [
        "The [LinkedIn post preview](/free-tools/post-preview/linkedin) shows where \"…more\" cuts your text and counts the 3,000-character limit.",
        "The [LinkedIn text formatter](/free-tools/linkedin-text-formatter) adds bold, italics and bullet lists, which LinkedIn's editor doesn't offer.",
      ],
    },
    {
      type: "paragraph",
      text: "For what the feed rewards after the hook (dwell time, comments, posting rhythm), see [the LinkedIn algorithm guide](/blog/linkedin-algorithm-guide).",
    },
    {
      type: "heading",
      text: "When a scheduler beats LinkedIn's own",
    },
    {
      type: "paragraph",
      text: "LinkedIn's scheduler is fine for a few posts a week on one profile. It stops being enough when:",
    },
    {
      type: "list",
      items: [
        "**You post the same idea elsewhere.** A founder update often goes to X, Threads and Bluesky too. Natively that is four composers and four schedules.",
        "**You run a profile and a Page.** You want to see both on one calendar, and to fix a Page post without deleting it.",
        "**You batch.** Writing a week of posts on Sunday is easier with a queue that fills set time slots.",
      ],
    },
    {
      type: "subheading",
      text: "Scheduling LinkedIn in Social0",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Connect LinkedIn with LinkedIn's official sign-in. Pick the profile and the Pages you want to publish to.",
        "Write the post once, select LinkedIn and any other networks, and give LinkedIn its own caption if the tone needs to differ.",
        "Add text, up to 20 images, or a video.",
        "Pick a time, drop it into your posting queue, or publish now.",
      ],
    },
    {
      type: "paragraph",
      text: "Until a post goes out, you can edit it in Social0 the same way whether it is for your profile or a Page.",
    },
    {
      type: "cta",
      text: "Schedule LinkedIn with X, Threads and the rest from one composer. Free plan, no credit card.",
      href: "/features/linkedin-scheduler",
      label: "See the LinkedIn scheduler",
    },
    {
      type: "heading",
      text: "When to schedule LinkedIn posts",
    },
    {
      type: "paragraph",
      text: "LinkedIn is a weekday network, and most of its audience reads during working hours in their own time zone. Start with the defaults in [the best time to post guide](/blog/best-time-to-post-on-social-media), then check your own post analytics after a few weeks. Two or three good posts a week, every week, beat a daily burst you can't keep up.",
    },
  ],
  faq: [
    {
      question: "Can you schedule posts on LinkedIn?",
      answer:
        "Yes. Click the clock icon next to Post, choose a date and time, and click Schedule. It works on desktop and in the mobile app, for personal profiles and company Pages.",
    },
    {
      question: "How far in advance can you schedule a LinkedIn post?",
      answer:
        "Up to 3 months. Profile posts need at least 10 minutes of lead time and company Page posts at least one hour, according to LinkedIn Help.",
    },
    {
      question: "Can I edit a scheduled LinkedIn post?",
      answer:
        "On a personal profile, yes: open View all scheduled posts, click the More icon and choose Edit post. On a company Page you can only reschedule or delete it, so to change the text you delete it and schedule it again.",
    },
    {
      question: "Where do I find my scheduled LinkedIn posts?",
      answer:
        "Click Start a post, then the clock icon, and choose View all scheduled posts. Page admins see Page posts in the Page's admin view.",
    },
    {
      question: "Does scheduling a LinkedIn post reduce its reach?",
      answer:
        "There's no evidence that LinkedIn ranks scheduled posts lower. What matters is how people react in the first hour, so schedule for a time when you can reply to comments.",
    },
  ],
  relatedPaths: [
    { href: "/features/linkedin-scheduler", label: "LinkedIn scheduler" },
    { href: "/free-tools/post-preview/linkedin", label: "LinkedIn post preview" },
    { href: "/free-tools/linkedin-text-formatter", label: "LinkedIn text formatter" },
  ],
  relatedSlugs: [
    "linkedin-algorithm-guide",
    "how-to-schedule-threads-posts",
    "best-time-to-post-on-social-media",
  ],
};
