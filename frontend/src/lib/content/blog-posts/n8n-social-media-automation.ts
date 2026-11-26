import type { BlogPost } from "../blog-types";

export const n8nSocialMediaAutomation: BlogPost = {
  slug: "n8n-social-media-automation",
  category: "AI & automation",
  metaTitle: "n8n Social Media Automation: Post to 9 Networks from One Workflow",
  metaDescription:
    "Build an n8n workflow that posts and schedules to X, LinkedIn, Instagram, TikTok and more with one HTTP Request node, from Google Sheets, RSS or an AI step.",
  keywords: [
    "n8n social media automation",
    "n8n social media posting",
    "n8n auto post to social media",
    "n8n linkedin post",
    "n8n instagram post",
    "n8n workflow social media",
    "n8n schedule social media posts",
  ],
  title: "n8n social media automation: post everywhere from one workflow",
  excerpt:
    "n8n can post to social media, but wiring X, LinkedIn, Instagram and TikTok separately means four developer apps and four sets of quirks. Here is a workflow that posts to all of them with one HTTP Request node, with copy-paste settings.",
  datePublished: "2026-11-26",
  readingMinutes: 9,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** n8n is great at the trigger and the content (a schedule, a Google Sheet, an RSS feed, an AI step). The hard part is publishing: each network needs its own developer app, OAuth setup and media rules. The simplest pattern is to let n8n build the post and send it to **one publishing API** with an **HTTP Request** node, which then posts to every network you connected.",
    },
    {
      type: "paragraph",
      text: "This guide builds that workflow with Social0's API, step by step. The same shape works with any unified posting API.",
    },
    {
      type: "heading",
      text: "Why not use n8n's built-in social nodes?",
    },
    {
      type: "paragraph",
      text: "n8n ships nodes for some networks, such as X and LinkedIn. They work, but each one needs credentials from that network's own developer program, and you build and maintain a separate branch per network. Coverage is uneven: TikTok, Threads and Bluesky publishing usually mean raw API calls, and Instagram means the Graph API with its container-then-publish flow. [The posting API guide](/blog/social-media-posting-api-guide) covers what each network asks for.",
    },
    {
      type: "table",
      caption: "Two ways to post from n8n",
      columns: ["", "One node per network", "One publishing API"],
      rows: [
        ["Developer apps to set up", "One per network", "None (connect accounts in the dashboard)"],
        ["Nodes in the workflow", "One branch per network", "One HTTP Request node"],
        ["TikTok, Threads, Bluesky", "Custom API calls", "Same request as every other network"],
        ["Scheduling", "Wait node or your own queue", "A scheduledAt field"],
        ["Failures", "Handled per branch", "One status per network, plus webhooks"],
      ],
    },
    {
      type: "heading",
      text: "Step 1: connect accounts and create an API key",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "In Social0, connect the networks you want under **Connections**. OAuth stays in the dashboard; n8n never sees your social passwords.",
        "Open **Developer → API keys**, create a key, and copy the `sk_live_…` value (it's shown once).",
        "In n8n, create a credential of type **Header Auth**: name `Authorization`, value `Bearer sk_live_…`.",
      ],
    },
    {
      type: "heading",
      text: "Step 2: get your account IDs",
    },
    {
      type: "paragraph",
      text: "Posts target account IDs, not network names. Add a temporary **HTTP Request** node, run it once, and copy the `id` of each account you want to post to:",
    },
    {
      type: "code",
      language: "text",
      code: "Method:          GET\nURL:             https://api.social0.app/v1/accounts\nAuthentication:  Generic Credential Type → Header Auth (the credential from step 1)",
    },
    {
      type: "heading",
      text: "Step 3: the publish node",
    },
    {
      type: "paragraph",
      text: "This one node does the posting. Set it up like this:",
    },
    {
      type: "code",
      language: "text",
      code: "Method:          POST\nURL:             https://api.social0.app/v1/posts/schedule\nAuthentication:  Header Auth (same credential)\nSend Body:       JSON\nBody:\n{\n  \"content\": \"{{ $json.text }}\",\n  \"platforms\": [\"ACCOUNT_ID_1\", \"ACCOUNT_ID_2\"],\n  \"scheduledAt\": \"{{ $json.publishAt }}\"\n}",
    },
    {
      type: "list",
      items: [
        "**Publish now instead of scheduling:** use `/v1/posts/publish` and drop `scheduledAt`.",
        "**Time format:** `scheduledAt` takes an ISO time such as `2026-12-01T09:00:00Z`, an explicit offset like `+05:30`, or `+default` to use the time zone set in your Social0 settings. It must be in the future and within a year.",
        "**No double posts on retries:** on the publish endpoint, add an `Idempotency-Key` header that is unique per post, such as the sheet row ID; a retry with the same key gets the original response back instead of a second post. For scheduled posts, mark the row as done right after the node succeeds (step 4) so the next run skips it.",
      ],
    },
    {
      type: "callout",
      title: "Publish returns before the post is live",
      text: "A publish call answers **202** with `status: \"queued\"`: the job was accepted, not finished. To act on the result, either poll `GET /v1/jobs/{tracking_id}` or, better, let Social0 call you back with a webhook (step 5).",
    },
    {
      type: "heading",
      text: "Step 4: pick a trigger",
    },
    {
      type: "paragraph",
      text: "Put one of these in front of the publish node. Each one only has to output `text` (and `publishAt` if you're scheduling):",
    },
    {
      type: "list",
      items: [
        "**Google Sheets content calendar:** a **Schedule Trigger** every hour → **Google Sheets** (read rows where Status is \"ready\") → publish → **Google Sheets** (set Status to \"scheduled\"). Writers fill in a sheet; n8n does the rest. [The content calendar guide](/blog/social-media-content-calendar) has a column layout that works.",
        "**Blog or changelog to social:** an **RSS Feed Trigger** on your blog → an AI step that writes a short post from the title and summary → publish. Every new article gets announced automatically.",
        "**AI-written posts with review:** an AI step drafts the post → n8n sends it to Slack or email for approval → on approval, publish. Keep a human in the loop for anything public.",
      ],
    },
    {
      type: "heading",
      text: "Step 5: know when a post fails",
    },
    {
      type: "paragraph",
      text: "Add a **Webhook** node in a second workflow and register its URL in Social0 for the `post.published` and `post.failed` events. Social0 then calls n8n when each post finishes, with a per-network status. Send failures to Slack so a rejected video or an expired login doesn't go unnoticed. Every delivery is signed in the `X-Social0-Signature` header, so you can check it really came from Social0. [Why scheduled posts fail](/blog/why-scheduled-posts-fail) covers the usual causes.",
    },
    {
      type: "heading",
      text: "Adding images and video",
    },
    {
      type: "paragraph",
      text: "Media is three calls: ask for an upload URL (`POST /v1/media/presign`), upload the file to that URL with an HTTP PUT, then confirm it (`POST /v1/media/confirm`) to get a media ID. Put the ID in a `media` array on the post. In n8n that is three HTTP Request nodes in a row. Images can be up to about 50 MB and videos about 500 MB, and the file must match each network's specs: see [the video specs guide](/blog/social-media-video-specs).",
    },
    {
      type: "heading",
      text: "Limits to plan around",
    },
    {
      type: "list",
      items: [
        "**API rate limits** are per hour and depend on your plan (the free plan allows 60 requests an hour), which is plenty for a posting workflow that runs every hour.",
        "**Platform rules still apply:** Instagram's 5-hashtag cap, X's 280 characters, TikTok's privacy rules. Check copy with the [free post previews](/free-tools) before you automate it.",
        "**Write different text per network** when it matters. One message cross-posted everywhere is fine for announcements; [cross-posting vs repurposing](/blog/cross-posting-vs-repurposing) covers when to rewrite.",
      ],
    },
    {
      type: "cta",
      text: "Get an API key and post to 9 networks from n8n. Free plan includes the API, no credit card.",
      href: "/tools/api",
      label: "See the Social0 API",
    },
  ],
  faq: [
    {
      question: "Can n8n post to social media automatically?",
      answer:
        "Yes. Use a trigger (Schedule, Google Sheets, RSS or a webhook), build the post text, and send it to a publishing API with an HTTP Request node, or use n8n's own nodes for each network.",
    },
    {
      question: "Can n8n post to Instagram and TikTok?",
      answer:
        "Not with a simple built-in node for every case. Instagram needs the Graph API's two-step container flow, and TikTok needs an approved Content Posting API app. A unified API like Social0 handles both through the same HTTP Request node.",
    },
    {
      question: "How do I schedule posts from n8n?",
      answer:
        "Either hold the item with a Wait node until the time comes, or send it straight away to an API that accepts a future time. Social0's /v1/posts/schedule takes a scheduledAt field up to a year ahead, so n8n doesn't need to stay running until then.",
    },
    {
      question: "How do I stop n8n from posting twice?",
      answer:
        "For immediate posts, send an Idempotency-Key header that is unique per post, such as the spreadsheet row ID; a retry within 24 hours gets the original response instead of a duplicate. For scheduled posts, mark the row as scheduled as soon as the request succeeds so the next run skips it.",
    },
    {
      question: "Do I need a paid plan to use the Social0 API from n8n?",
      answer:
        "No. The API is on every plan, including Free (3 accounts, 10 posts). Paid plans raise the post and account limits and the hourly API quota.",
    },
  ],
  relatedPaths: [
    { href: "/tools/api", label: "Social0 API" },
    { href: "/tools/webhooks", label: "Publish webhooks" },
    { href: "/features/multi-platform-scheduler", label: "Multi-platform scheduler" },
  ],
  relatedSlugs: [
    "social-media-posting-api-guide",
    "social-media-automation-for-developers",
    "post-to-social-media-from-claude-code",
  ],
};
