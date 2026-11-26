import type { BlogPost } from "../blog-types";

export const makeSocialMediaAutomation: BlogPost = {
  slug: "make-social-media-automation",
  category: "AI & automation",
  metaTitle: "Make.com Social Media Automation: Post to 9 Networks (2026)",
  metaDescription:
    "Build a Make scenario that posts and schedules to X, LinkedIn, Instagram, TikTok, Threads and Bluesky with one HTTP module, from Google Sheets, RSS or an AI step.",
  keywords: [
    "make.com social media automation",
    "make social media posting",
    "make.com auto post to social media",
    "make scenario social media",
    "integromat social media",
    "make.com linkedin post",
    "make.com instagram post",
  ],
  title: "Make.com social media automation: one scenario, every network",
  excerpt:
    "Make has modules for a few networks, but each needs its own connection and some have been withdrawn. One HTTP module that calls a posting API covers all of them. Here is the scenario, with the exact module settings.",
  datePublished: "2026-11-26",
  readingMinutes: 7,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** let Make do what it is good at (watching a Google Sheet, an RSS feed or a form, and shaping the text with an AI module), then send the finished post to **one publishing API** with Make's **HTTP → Make a request** module. The API posts to every account you connected, so you don't need one module and one connection per network.",
    },
    {
      type: "paragraph",
      text: "The HTTP module is a built-in Make app and works on the free plan. Each run uses operations from your monthly allowance, so check your plan's limit against how often the scenario runs.",
    },
    {
      type: "heading",
      text: "Why not use Make's social media modules?",
    },
    {
      type: "paragraph",
      text: "Make has apps for some networks, such as Facebook Pages and LinkedIn. But coverage changes when networks change their APIs (Make's own community has threads on posting to X by HTTP after its X app was withdrawn), TikTok, Threads and Bluesky usually mean raw API calls anyway, and each network is another connection to keep authorized. One posting API keeps the scenario to a single module.",
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
        "In Make, add an **HTTP → Make a request** module: URL `https://api.social0.app/v1/accounts`, method **GET**, and a header `Authorization` = `Bearer sk_live_…`.",
        "Click **Run once** and copy the `id` of each account you want to post to. Then delete this module or keep it disabled.",
      ],
    },
    {
      type: "heading",
      text: "Step 2: the posting module",
    },
    {
      type: "code",
      language: "text",
      code: "Module:        HTTP → Make a request\nURL:           https://api.social0.app/v1/posts/schedule\nMethod:        POST\nHeaders:       Authorization = Bearer sk_live_…\nBody type:     Raw\nContent type:  JSON (application/json)\nRequest content:\n{\n  \"content\": \"{{1.text}}\",\n  \"platforms\": [\"ACCOUNT_ID_1\", \"ACCOUNT_ID_2\"],\n  \"scheduledAt\": \"{{1.publish_at}}\"\n}\nParse response: Yes",
    },
    {
      type: "list",
      items: [
        "Replace `1.text` and `1.publish_at` with the fields from your trigger module.",
        "**Post now instead:** change the URL to `/v1/posts/publish` and remove `scheduledAt`.",
        "**Time format:** an ISO time such as `2026-12-01T09:00:00Z`, an offset like `+05:30`, or your local time followed by `+default` (e.g. `2026-12-01T09:00:00+default`) to use the time zone in your Social0 settings; up to a year ahead.",
        "**Quotes and line breaks in the text** can break raw JSON. Wrap the field with Make's `replace()` function, or build the body with a **JSON → Create JSON** module first.",
      ],
    },
    {
      type: "heading",
      text: "Step 3: a trigger",
    },
    {
      type: "list",
      items: [
        "**Google Sheets calendar:** **Google Sheets → Watch New Rows** (or Search Rows where Status is \"ready\") → posting module → **Update a Row** to mark it scheduled, so the next run skips it. [The content calendar guide](/blog/social-media-content-calendar) has a column layout.",
        "**Blog to social:** **RSS → Watch RSS feed items** → an AI module that writes a short post from the title and summary → posting module.",
        "**Form or Airtable:** watch new records from a submission form or base, then post. Good for teams where several people suggest posts.",
      ],
    },
    {
      type: "callout",
      title: "Add a review step for AI posts",
      text: "If an AI module writes the text, send it to Slack or email first and only post after someone approves it. A scenario that posts unreviewed AI text to nine networks can embarrass you nine times at once.",
    },
    {
      type: "heading",
      text: "Step 4: catch failures",
    },
    {
      type: "paragraph",
      text: "Publishing happens after the API replies (it returns **202** with `status: \"queued\"`), so a successful HTTP module doesn't mean the post is live. Create a second scenario that starts with **Webhooks → Custom webhook**, register its URL in Social0 for `post.failed` (and `post.published` if you want a log), and send failures to Slack or email. [Why scheduled posts fail](/blog/why-scheduled-posts-fail) explains the usual causes.",
    },
    {
      type: "heading",
      text: "Images and video",
    },
    {
      type: "paragraph",
      text: "Attaching media takes three HTTP modules: `POST /v1/media/presign` to get an upload URL, an HTTP **PUT** of the file to that URL, then `POST /v1/media/confirm` to get a media ID you add to the post's `media` array. Check the file against each network's specs first: [image sizes](/blog/social-media-image-sizes) and [video specs](/blog/social-media-video-specs).",
    },
    {
      type: "cta",
      text: "Post to 9 networks from one Make module. The API is on every plan, including Free.",
      href: "/tools/api",
      label: "See the Social0 API",
    },
    {
      type: "paragraph",
      text: "Using n8n instead? The same setup is in [the n8n guide](/blog/n8n-social-media-automation), and [the Zapier guide](/blog/zapier-social-media-automation) covers Zapier.",
    },
  ],
  faq: [
    {
      question: "Can Make.com post to social media automatically?",
      answer:
        "Yes. Use a trigger such as Google Sheets, RSS or a form, then either a network's own Make app or one HTTP module that calls a posting API like Social0's to publish to several networks at once.",
    },
    {
      question: "Does the HTTP module work on Make's free plan?",
      answer:
        "Yes. HTTP is a built-in Make app. Every run uses operations from your plan's monthly allowance, so match how often the scenario runs to your limit.",
    },
    {
      question: "Can Make post to TikTok, Threads and Bluesky?",
      answer:
        "Through a posting API, yes: the same HTTP request that posts to X or LinkedIn posts to TikTok, Threads and Bluesky if those accounts are connected in Social0.",
    },
    {
      question: "How do I schedule posts from Make?",
      answer:
        "Send the post to an endpoint that accepts a future time, such as Social0's /v1/posts/schedule with a scheduledAt field. The scenario finishes straight away and the post goes out at that time.",
    },
    {
      question: "Why does my Make HTTP request fail with a JSON error?",
      answer:
        "Usually quotes or line breaks in the post text break the raw JSON. Build the body with a JSON → Create JSON module, or escape the text before mapping it in.",
    },
  ],
  relatedPaths: [
    { href: "/tools/api", label: "Social0 API" },
    { href: "/tools/webhooks", label: "Publish webhooks" },
    { href: "/features/multi-platform-scheduler", label: "Multi-platform scheduler" },
  ],
  relatedSlugs: [
    "n8n-social-media-automation",
    "zapier-social-media-automation",
    "social-media-posting-api-guide",
  ],
};
