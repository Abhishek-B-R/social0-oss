import type { BlogPost } from "../blog-types";

export const howToCancelBuffer: BlogPost = {
  slug: "how-to-cancel-buffer",
  category: "Strategy",
  metaTitle: "How to Cancel Buffer (and Keep Your Scheduled Posts)",
  metaDescription:
    "The exact clicks to cancel a Buffer plan, what happens to your channels and queue afterwards, and how to save your scheduled posts first. Checked November 2026.",
  keywords: [
    "how to cancel buffer",
    "cancel buffer subscription",
    "buffer cancel plan",
    "export buffer scheduled posts",
    "buffer alternative",
  ],
  title: "How to cancel Buffer without losing your scheduled posts",
  excerpt:
    "Cancelling takes a minute. Saving your queue is the part people miss: Buffer has no export for scheduled posts, so do this first.",
  datePublished: "2026-11-19",
  readingMinutes: 4,
  body: [
    {
      type: "paragraph",
      text: "You can cancel a paid Buffer plan from its billing page in about a minute. Your plan stays active until the end of the period you paid for, then the account drops to the Free plan. What catches people out is the queue: Buffer has no built-in export for scheduled posts, so copy them before you cancel. Everything below was checked against Buffer's help center on 2026-11-19.",
    },
    { type: "heading", text: "Before you cancel: save your queue" },
    {
      type: "list",
      ordered: true,
      items: [
        "Open each channel's queue and copy the text and media of every scheduled post you want to keep. Buffer's help center says scheduled posts can't be exported directly; the workaround it mentions is a Zapier automation.",
        "If you're on a paid plan and want your past results, export published-post analytics as CSV from Insights while you still have access.",
        "Note which channels you'll keep. After the downgrade, the Free plan allows 3 channels; extra channels get locked.",
      ],
    },
    { type: "heading", text: "How to cancel your Buffer plan" },
    {
      type: "list",
      ordered: true,
      items: [
        "Click your profile avatar in the bottom-left corner.",
        "Open **Billing**.",
        "Click the three dots next to your plan and choose **Cancel Plan**.",
        "Answer the short survey and confirm.",
      ],
    },
    {
      type: "paragraph",
      text: "Your paid features run until the end of the current billing period, then the account becomes a Free account (3 channels, 10 scheduled posts per channel). If you bought Buffer through an app store, cancel there instead.",
    },
    { type: "heading", text: "What you keep on Buffer's Free plan" },
    {
      type: "paragraph",
      text: "Free keeps 3 channels with up to 10 scheduled posts each, and Buffer includes its API on every plan, Free too. If that covers you, you may not need to cancel at all; downgrading is the same flow.",
    },
    { type: "heading", text: "Moving your posts to Social0" },
    {
      type: "paragraph",
      text: "Social0 posts to X, LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky and Pinterest from one composer. To move over: connect your accounts, paste the posts you saved into the composer, and drop them onto the calendar. There is no automatic Buffer importer yet, so a long queue takes a few minutes.",
    },
    {
      type: "table",
      caption: "Buffer vs Social0 pricing for 15 accounts (checked 2026-11-19)",
      columns: ["", "Buffer", "Social0"],
      rows: [
        ["How it's priced", "Per channel: $5/mo Essentials, $10/mo Team", "Per plan: Creator $29.90/mo for 15 accounts"],
        ["10 channels", "$50/mo on Essentials", "$29.90/mo (Creator covers 15)"],
        ["Free plan", "3 channels, 10 scheduled posts each", "3 accounts, 10 posts"],
        ["API and MCP", "API on every plan; Buffer MCP", "REST API, MCP and CLI on every plan"],
      ],
    },
    {
      type: "cta",
      text: "Want to try it with your own accounts first? The free plan needs no card.",
      href: "/pricing",
      label: "See Social0 pricing",
    },
  ],
  faq: [
    {
      question: "Does Buffer refund me when I cancel?",
      answer:
        "Buffer's cancellation article doesn't promise a refund: the plan stays active until the end of the period you paid for. Ask Buffer support if you were charged by mistake.",
    },
    {
      question: "Can I export my scheduled posts from Buffer?",
      answer:
        "Not directly. Buffer's help center says scheduled posts can't be exported; copy them by hand or use a Zapier automation. Published-post analytics can be exported as CSV on paid plans.",
    },
    {
      question: "What happens to my channels after I cancel Buffer?",
      answer:
        "The account moves to the Free plan at the end of the billing period. Free allows 3 channels, so channels beyond that are locked until you upgrade again.",
    },
  ],
  relatedPaths: [
    { href: "/alternatives/buffer", label: "Social0 vs Buffer" },
    { href: "/pricing", label: "Social0 pricing" },
  ],
  relatedSlugs: ["how-to-cancel-hootsuite", "managing-multiple-social-accounts"],
};
