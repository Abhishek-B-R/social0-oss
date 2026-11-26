import type { BlogPost } from "../blog-types";

export const zapierSocialMediaAutomation: BlogPost = {
  slug: "zapier-social-media-automation",
  category: "AI & automation",
  metaTitle: "Zapier Social Media Automation: Post to Every Network from One Zap",
  metaDescription:
    "Build a Zap that posts and schedules to X, LinkedIn, Instagram, TikTok, Threads and Bluesky from Google Sheets, RSS or a form, using one Webhooks by Zapier step.",
  keywords: [
    "zapier social media automation",
    "zapier social media posting",
    "zapier auto post to social media",
    "zapier schedule social media posts",
    "zapier linkedin post",
    "zapier instagram post",
    "webhooks by zapier",
  ],
  title: "Zapier social media automation: one Zap, every network",
  excerpt:
    "Zapier connects to almost everything, but posting to TikTok, Threads or Bluesky, or scheduling for later, needs more than its built-in social apps. One Webhooks by Zapier step that calls a posting API handles all of it. Here is the Zap, step by step.",
  datePublished: "2026-11-26",
  readingMinutes: 7,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** use any trigger (a new Google Sheets row, a new RSS item, a form submission), then a **Webhooks by Zapier → Custom Request** step that sends the post to one publishing API. The API posts or schedules it to every network you connected, so one Zap covers X, LinkedIn, Instagram, TikTok, YouTube, Threads, Bluesky, Facebook and Pinterest.",
    },
    {
      type: "callout",
      title: "Know this first: Webhooks is a premium app",
      text: "Zapier lists **Webhooks by Zapier** as a premium app, so a Zap that uses it needs a paid Zapier plan (new accounts get a trial). If you need this on a free tool, [Make](/blog/make-social-media-automation) and [n8n](/blog/n8n-social-media-automation) can do the same with their HTTP modules.",
    },
    {
      type: "heading",
      text: "Why not use Zapier's built-in social apps?",
    },
    {
      type: "paragraph",
      text: "Zapier has apps for some networks, such as LinkedIn and Facebook Pages. They're fine for one network, but each is a separate connection and action, coverage of newer networks like Threads and Bluesky is thin, and most post immediately rather than at a chosen time. Sending everything through one posting API keeps the Zap to two steps and gives you scheduling.",
    },
    {
      type: "heading",
      text: "Step 1: API key and account IDs",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "In Social0, connect your networks under **Connections**, then create an API key under **Developer → API keys** (`sk_live_…`, shown once).",
        "Run this once in a terminal, or in a test **Webhooks by Zapier → GET** step, and copy the `id` of each account you want to post to:",
      ],
    },
    {
      type: "code",
      language: "bash",
      code: "curl -s https://api.social0.app/v1/accounts \\\n  -H \"Authorization: Bearer sk_live_YOUR_KEY\"",
    },
    {
      type: "heading",
      text: "Step 2: the posting step",
    },
    {
      type: "paragraph",
      text: "Add an action: **Webhooks by Zapier → Custom Request**. Use Custom Request rather than POST, because POST's form fields make it awkward to send a list of account IDs.",
    },
    {
      type: "code",
      language: "text",
      code: "Method:   POST\nURL:      https://api.social0.app/v1/posts/schedule\nHeaders:  Authorization | Bearer sk_live_…\n          Content-Type  | application/json\nData:\n{\n  \"content\": \"(map your text field here)\",\n  \"platforms\": [\"ACCOUNT_ID_1\", \"ACCOUNT_ID_2\"],\n  \"scheduledAt\": \"(map your date field here)\"\n}",
    },
    {
      type: "list",
      items: [
        "**Post now instead:** use `/v1/posts/publish` and remove `scheduledAt`.",
        "**Dates:** use a **Formatter by Zapier → Date / Time** step to turn your sheet's date into an ISO time like `2026-12-01T09:00:00Z`. Or send your local time followed by `+default` (e.g. `2026-12-01T09:00:00+default`) to use the time zone in your Social0 settings.",
        "**Quotes in your text** break raw JSON. Run the text through a **Formatter → Text → Replace** step to escape double quotes, or keep post text free of them.",
      ],
    },
    {
      type: "heading",
      text: "Step 3: pick a trigger",
    },
    {
      type: "list",
      items: [
        "**Google Sheets → New or Updated Spreadsheet Row:** a content calendar anyone on the team can fill in. Add a final **Update Spreadsheet Row** step that marks the row as scheduled. [The content calendar guide](/blog/social-media-content-calendar) has a column layout.",
        "**RSS by Zapier → New Item in Feed:** announce every new blog post or changelog entry. Add an AI step to turn the title and summary into a short post.",
        "**Forms, Airtable or Notion:** collect post ideas from your team and post the approved ones.",
      ],
    },
    {
      type: "heading",
      text: "Step 4: hear about failures",
    },
    {
      type: "paragraph",
      text: "The API accepts the post right away (a **202** with `status: \"queued\"`) and publishes in the background, so a green Zap run doesn't mean the post is live. Make a second Zap with **Webhooks by Zapier → Catch Hook**, register its URL in Social0 for `post.failed`, and send the details to Slack or email. [Why scheduled posts fail](/blog/why-scheduled-posts-fail) covers the usual reasons.",
    },
    {
      type: "heading",
      text: "Images and video",
    },
    {
      type: "paragraph",
      text: "Media needs three requests: `POST /v1/media/presign`, an upload of the file to the returned URL, and `POST /v1/media/confirm`, which returns a media ID for the post's `media` array. That's easier in a code step or in [n8n](/blog/n8n-social-media-automation) than in plain Zapier steps, so many people keep Zapier for text and link posts and add media in the dashboard.",
    },
    {
      type: "cta",
      text: "Post to 9 networks from one Zap. The API is on every Social0 plan, including Free.",
      href: "/tools/api",
      label: "See the Social0 API",
    },
  ],
  faq: [
    {
      question: "Can Zapier post to social media automatically?",
      answer:
        "Yes. Zapier has apps for some networks, and a Webhooks by Zapier step can call a posting API like Social0's to publish or schedule to many networks from one Zap.",
    },
    {
      question: "Is Webhooks by Zapier free?",
      answer:
        "No. Zapier lists it as a premium app, so the Zap needs a paid Zapier plan after any trial. Make and n8n offer HTTP modules on their free tiers.",
    },
    {
      question: "Can Zapier schedule posts for a specific time?",
      answer:
        "Yes, if the step calls an endpoint that accepts a future time, such as Social0's /v1/posts/schedule with scheduledAt. You can also hold a Zap with Delay by Zapier, but sending the time to the API is simpler.",
    },
    {
      question: "Can Zapier post to TikTok, Threads and Bluesky?",
      answer:
        "Through a posting API, yes. The same request that posts to LinkedIn or X also posts to TikTok, Threads and Bluesky when those accounts are connected in Social0.",
    },
    {
      question: "Why use Custom Request instead of POST in Webhooks by Zapier?",
      answer:
        "Custom Request lets you send raw JSON, including the list of account IDs. The POST action builds the body from form fields, which makes lists awkward.",
    },
  ],
  relatedPaths: [
    { href: "/tools/api", label: "Social0 API" },
    { href: "/tools/webhooks", label: "Publish webhooks" },
    { href: "/features/multi-platform-scheduler", label: "Multi-platform scheduler" },
  ],
  relatedSlugs: [
    "make-social-media-automation",
    "n8n-social-media-automation",
    "social-media-posting-api-guide",
  ],
};
