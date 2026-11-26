import type { BlogPost } from "../blog-types";

export const howToSchedulePinterestPins: BlogPost = {
  slug: "how-to-schedule-pinterest-pins",
  category: "Platform specs",
  metaTitle: "How to Schedule Pinterest Pins: Native Limits and Workarounds",
  metaDescription:
    "Schedule Pins on Pinterest up to 30 days ahead with a business account, why the native scheduler caps how many you can queue, and how to batch Pins for months.",
  keywords: [
    "how to schedule pinterest pins",
    "schedule pinterest pins",
    "pinterest scheduler",
    "schedule pins on pinterest",
    "pinterest scheduled pins limit",
    "can you schedule pins on pinterest",
  ],
  title: "How to schedule Pinterest Pins",
  excerpt:
    "Pinterest has a built-in scheduler for business accounts, but it looks only 30 days ahead and holds a small number of Pins at a time. That's a problem for a network where Pins live for months. Here is the native flow, its limits, and how to batch Pins properly.",
  datePublished: "2026-11-26",
  readingMinutes: 6,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** with a **business account**, create a Pin as usual, choose **Publish at a later date**, pick a date up to **30 days** ahead, and click **Publish**. Pinterest's help pages have also listed a cap of **10 scheduled Pins** at a time, scheduled one by one. To queue more, or further out, use a scheduler that publishes through Pinterest's API.",
    },
    {
      type: "heading",
      text: "Schedule a Pin on Pinterest",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Make sure you have a **business account** (free to switch in settings).",
        "Click **Create → Pin** (or the + in the app) and upload the image or video.",
        "Add a title, description, destination link and the **board**.",
        "Choose **Publish at a later date**, then pick the date and time.",
        "Click **Publish**. The Pin shows under your scheduled Pins until it goes live.",
      ],
    },
    {
      type: "heading",
      text: "Why the native limits bite on Pinterest",
    },
    {
      type: "paragraph",
      text: "Pinterest works more like a search engine than a feed: Pins are found through search for months after they're posted, and a steady stream of fresh Pins tends to do better than a burst. That makes **batching** the natural workflow: design twenty Pins on Sunday and spread them over a few weeks. A small queue that only looks 30 days ahead fights that.",
    },
    {
      type: "table",
      caption: "Native scheduler vs an API scheduler",
      columns: ["", "Pinterest's scheduler", "API scheduler (e.g. Social0)"],
      rows: [
        ["How far ahead", "Up to 30 days", "Set by the tool"],
        ["How many queued", "A small cap (help pages have said 10)", "Limited by your plan, not Pinterest"],
        ["Other networks", "Pinterest only", "Same post to Instagram, Facebook and more"],
        ["Account needed", "Business account", "Business account connected by OAuth"],
      ],
    },
    {
      type: "heading",
      text: "Get the Pin right before you schedule it",
    },
    {
      type: "list",
      items: [
        "**Vertical 2:3, such as 1000 × 1500.** Taller images get cropped in the feed. The [image resizer](/free-tools/image-resizer) exports the Pinterest size along with every other network's. All sizes are in [the image sizes guide](/blog/social-media-image-sizes).",
        "**Title and description with real search words.** People find Pins by searching, so write what someone would type (\"small balcony garden ideas\"), not a slogan.",
        "**A destination link on every Pin.** That's where the traffic goes. Check how the page looks when shared with the [link preview checker](/free-tools/link-preview-checker).",
        "**The right board.** Boards are topics; a Pin on a well-named board is easier for Pinterest to classify.",
      ],
    },
    {
      type: "subheading",
      text: "Scheduling Pins in Social0",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Connect Pinterest with its official sign-in.",
        "Upload the image or video and select Pinterest, along with Instagram or Facebook if the same visual goes there.",
        "Pick a public board, or create one from the composer. Add an optional title (up to 100 characters) and a destination link, and save both as the default for that account.",
        "Pick a time or add it to your posting queue. Repeat for the rest of the batch.",
      ],
    },
    {
      type: "paragraph",
      text: "Pins can only go to **public** boards through Pinterest's API, so secret boards aren't offered.",
    },
    {
      type: "cta",
      text: "Batch Pins past Pinterest's queue limit, with Instagram and Facebook on the same calendar. Free plan, no credit card.",
      href: "/features/pinterest-scheduler",
      label: "See the Pinterest scheduler",
    },
  ],
  faq: [
    {
      question: "Can you schedule Pins on Pinterest?",
      answer:
        "Yes, with a business account. When creating a Pin, choose Publish at a later date and pick a time up to 30 days ahead.",
    },
    {
      question: "How many Pins can I schedule at once?",
      answer:
        "Pinterest's own scheduler has a small cap; its help pages have listed 10 scheduled Pins at a time. Schedulers that use Pinterest's API, such as Social0, aren't held to that queue.",
    },
    {
      question: "How far in advance can I schedule a Pin?",
      answer:
        "Up to 30 days with Pinterest's native scheduler. Older help pages said two weeks, so check the date picker if it looks shorter.",
    },
    {
      question: "Can I schedule Pins to a secret board?",
      answer:
        "Not through Pinterest's API, which only publishes to public boards. Use Pinterest itself for secret boards.",
    },
    {
      question: "What size should a Pin be?",
      answer:
        "A 2:3 vertical image such as 1000 × 1500 pixels. Much taller images get cropped in the feed.",
    },
  ],
  relatedPaths: [
    { href: "/features/pinterest-scheduler", label: "Pinterest scheduler" },
    { href: "/free-tools/image-resizer", label: "Free image resizer" },
    { href: "/free-tools/post-preview/pinterest", label: "Pinterest Pin preview" },
  ],
  relatedSlugs: [
    "social-media-image-sizes",
    "how-to-schedule-facebook-posts",
    "how-to-schedule-instagram-posts",
  ],
};
