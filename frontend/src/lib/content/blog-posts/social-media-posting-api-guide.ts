import type { BlogPost } from "../blog-types";

export const socialMediaPostingApiGuide: BlogPost = {
  slug: "social-media-posting-api-guide",
  category: "Engineering",
  metaTitle: "Social Media Posting API: A Developer's Guide (2026)",
  metaDescription:
    "What it takes to publish programmatically to Instagram, X, LinkedIn, TikTok, and YouTube — auth models, app review, rate limits, and when to use a unified API instead of building nine integrations.",
  keywords: [
    "social media posting api",
    "social media api",
    "publish to social media programmatically",
    "instagram graph api publishing",
    "linkedin api post",
    "unified social media api",
  ],
  title: "Social media posting API: a developer's guide",
  excerpt:
    "Nine networks, five auth models, three review processes, and a different failure taxonomy each. An honest account of what building direct integrations costs — and how to decide whether to.",
  datePublished: "2026-09-09",
  dateModified: "2026-09-20",
  readingMinutes: 13,
  body: [
    {
      type: "paragraph",
      text: "Publishing a post through an API looks like a solved problem until you try it. The first integration takes a week. The ninth takes a month, because by then you are maintaining eight others that keep changing underneath you.",
    },
    {
      type: "paragraph",
      text: "This is a map of the actual terrain: what each platform requires, where the real cost is, and how to decide between building direct and using a unified layer.",
    },
    {
      type: "heading",
      text: "The auth models you will deal with",
    },
    {
      type: "paragraph",
      text: "There is no single pattern. Five distinct models across nine networks:",
    },
    {
      type: "table",
      columns: ["Model", "Platforms", "What it means for you"],
      rows: [
        [
          "OAuth 2.0 + refresh",
          "LinkedIn, YouTube, Pinterest, Threads",
          "The well-trodden path. Store the refresh token, rotate before expiry, handle revocation.",
        ],
        [
          "OAuth 2.0 + long-lived exchange",
          "Instagram, Facebook",
          "Short-lived token must be exchanged for a ~60-day one, then refreshed before it lapses. Miss the window and the user must reconnect.",
        ],
        [
          "OAuth 1.0a",
          "X (Twitter)",
          "Request signing per call. Older, fiddlier, and required for some media endpoints.",
        ],
        [
          "OAuth 2.0 + PKCE",
          "TikTok",
          "Login Kit with PKCE. Separate app products for posting versus messaging.",
        ],
        [
          "App password / BYOK",
          "Bluesky",
          "AT Protocol. The user generates an app password; no OAuth dance at all.",
        ],
      ],
    },
    {
      type: "callout",
      title: "Token expiry is the top support burden",
      text: "Not publishing bugs — **expired tokens**. Users connect an account, come back three months later, and the token is dead. Your system needs to detect a 401 (or X's error code 89), mark the connection as needing reconnection, and tell the user — rather than retrying a job that can never succeed.",
    },
    {
      type: "heading",
      text: "App review is the real timeline",
    },
    {
      type: "paragraph",
      text: "Writing the code is not what makes this take months. Getting permission to run it is.",
    },
    {
      type: "list",
      items: [
        "**Meta (Instagram, Facebook, Threads):** App review for publishing permissions. Expect 2–4 weeks per submission, and expect at least one rejection for an unclear screencast or privacy policy. A business verification step may also apply.",
        "**TikTok:** Separate review per product. Content Posting API and Business Messaging are distinct approvals — a token from one will not work for the other, which produces confusing 403s if you assume otherwise.",
        "**YouTube:** Google OAuth verification, plus a security assessment if you request sensitive scopes. The slowest of the set when it applies.",
        "**X:** Tiered paid access. The free tier is not usable for a real publishing product.",
        "**LinkedIn:** Partner programme access for some post types; basic member posting is more accessible.",
        "**Bluesky and Pinterest:** The least friction. Bluesky in particular has no review at all.",
      ],
    },
    {
      type: "paragraph",
      text: "Budget review time as calendar time, not engineering time. You cannot parallelise a queue you do not control.",
    },
    {
      type: "heading",
      text: "Publishing is rarely one call",
    },
    {
      type: "paragraph",
      text: "Text posts are usually a single POST. Media is where the shapes diverge.",
    },
    {
      type: "subheading",
      text: "Container-then-publish (Instagram, Threads)",
    },
    {
      type: "paragraph",
      text: "You create a media container referencing a **publicly reachable URL**, poll until the platform finishes ingesting it, then publish the container:",
    },
    {
      type: "code",
      language: "bash",
      code: `# 1. create the container
POST /{ig-user-id}/media
  ?image_url=https://cdn.example.com/photo.jpg
  &caption=...

# 2. poll status_code until FINISHED (video can take minutes)
GET /{container-id}?fields=status_code

# 3. publish
POST /{ig-user-id}/media_publish
  ?creation_id={container-id}`,
    },
    {
      type: "paragraph",
      text: "Note the implication: you need object storage with public URLs, because Meta fetches the media itself. You cannot stream bytes directly.",
    },
    {
      type: "subheading",
      text: "Chunked upload (X, YouTube, TikTok)",
    },
    {
      type: "paragraph",
      text: "Video goes up in an INIT / APPEND / FINALIZE sequence, with each chunk a separate request and an async processing step afterwards. Any chunk can fail independently, so you need resumable state rather than a single try/catch around one call.",
    },
    {
      type: "subheading",
      text: "Direct multipart (LinkedIn, Facebook, Pinterest, Bluesky)",
    },
    {
      type: "paragraph",
      text: "Register an upload, PUT the bytes, reference the returned asset id in the post. Closest to what people expect, though LinkedIn's asset registration has its own quirks.",
    },
    {
      type: "heading",
      text: "Rate limits, and how differently they are expressed",
    },
    {
      type: "table",
      columns: ["Platform", "Limit shape"],
      rows: [
        [
          "Instagram",
          "Rolling 24-hour publishing cap per account, plus hourly API call limits. Not a midnight reset.",
        ],
        ["X", "Per-endpoint windows, tied to your access tier."],
        ["LinkedIn", "Daily per-member and per-application throttles."],
        ["TikTok", "Per-user daily posting caps."],
        ["YouTube", "A daily quota in cost units, where an upload is expensive."],
      ],
    },
    {
      type: "paragraph",
      text: "The units are different, the windows are different, and the error responses are different. Writing one retry policy that behaves correctly against all of them is more work than writing the publishers.",
    },
    {
      type: "callout",
      title: "Never retry blindly",
      text: "A 429 means back off. A 401 means reconnect and **stop** — retrying is guaranteed to fail and burns quota. A 400 for an oversized video means fix the input, not try again. Treating all non-2xx responses the same way is how you get duplicate posts and exhausted quotas. More on this in [why scheduled posts fail](/blog/why-scheduled-posts-fail).",
    },
    {
      type: "heading",
      text: "What you will build beyond the API calls",
    },
    {
      type: "paragraph",
      text: "This is the part that surprises people. The platform integrations are maybe 40% of the work. The rest:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Token lifecycle.** Encrypted storage, proactive refresh, revocation detection, reconnect prompts.",
        "**Media pipeline.** Object storage, public URLs, per-platform transcoding and compression, format validation before upload.",
        "**Job queue.** Scheduled publishing needs durable jobs, per-platform fan-out, retries with backoff, and a dead-letter path.",
        "**Partial failure handling.** One post to five platforms is five independent outcomes. Three succeeded and two failed is the normal case, not an edge case, and your data model has to represent it.",
        "**Idempotency.** A timeout that actually succeeded must not produce a second post on retry.",
        "**Validation.** Caption limits, video duration, file size, aspect ratio — per platform, checked before upload rather than discovered from an error.",
        "**Observability.** When a customer asks why their Tuesday post did not go out, you need a per-platform answer.",
      ],
    },
    {
      type: "paragraph",
      text: "A realistic figure for a production-grade direct integration across nine networks is several engineer-months up front, plus ongoing maintenance as platforms deprecate endpoints — which they do, on their schedule, not yours.",
    },
    {
      type: "heading",
      text: "Direct or unified?",
    },
    {
      type: "paragraph",
      text: "A straightforward decision, if you are honest about which side you are on.",
    },
    {
      type: "table",
      columns: ["Build direct when", "Use a unified API when"],
      rows: [
        [
          "Publishing **is** your product and the integration is your moat.",
          "Publishing is a feature of something else you are building.",
        ],
        [
          "You need platform-specific capabilities a unified layer abstracts away.",
          "You need the common 90%: text, image, video, threads, scheduling.",
        ],
        [
          "You have the headcount to own nine integrations indefinitely.",
          "You would rather spend that headcount on your actual product.",
        ],
        [
          "Your compliance posture requires holding the OAuth tokens yourself.",
          "You would rather not be responsible for storing other people's platform credentials.",
        ],
      ],
    },
    {
      type: "paragraph",
      text: "A unified API collapses nine auth models, nine media pipelines, and nine review processes into one HTTP surface. Social0's [`/v1` API](/tools/api) is that surface — create a post, attach media, publish or schedule, poll the job, and receive [webhooks](/tools/webhooks) when each platform finishes.",
    },
    {
      type: "code",
      language: "bash",
      code: `curl -X POST https://api.social0.app/v1/posts \\
  -H "Authorization: Bearer $SOCIAL0_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Shipped something new today.",
    "account_ids": ["acc_linkedin_1", "acc_x_1"],
    "scheduled_at": "2026-10-01T09:00:00Z"
  }'`,
    },
    {
      type: "paragraph",
      text: "The full schema is published as OpenAPI, so you can generate a client rather than hand-writing one.",
    },
    {
      type: "cta",
      text: "One API for nine networks, with webhooks and an OpenAPI spec.",
      href: "/tools/api",
      label: "Read the API docs",
    },
    {
      type: "heading",
      text: "If you build direct, get these right",
    },
    {
      type: "list",
      items: [
        "**Store platform limits as constants, not magic numbers.** One module, referenced everywhere, updated when a platform moves.",
        "**Validate before upload.** Rejecting a 4-minute video for Bluesky before you spend 100 MB of bandwidth is strictly better than after.",
        "**Model each platform outcome separately.** A post row with one status field cannot represent “published to three, failed on two”.",
        "**Make the publish path idempotent from day one.** Retrofitting this after your first duplicate-post incident is much harder.",
        "**Classify errors into retry / reconnect / fix-input.** Three buckets, three behaviours. This single distinction prevents most of the bad failure modes.",
        "**Log a tracking id through the whole pipeline.** Future you, debugging a customer's missing post, will need it.",
      ],
    },
  ],
  faq: [
    {
      question: "Can I post to Instagram programmatically?",
      answer:
        "Yes, through the Instagram Graph API with a Business or Creator account. Publishing is a two-step flow: create a media container pointing at a publicly reachable URL, poll until processing finishes, then publish the container. It requires Meta app review, which typically takes two to four weeks.",
    },
    {
      question: "What does it cost to build social media API integrations?",
      answer:
        "Realistically several engineer-months for production-grade coverage of the major networks, plus ongoing maintenance. The API calls are roughly 40% of the work — token lifecycle, media pipeline, job queue, partial failure handling, and idempotency are the rest.",
    },
    {
      question: "Should I use a unified social media API or build direct integrations?",
      answer:
        "Build direct if publishing is your core product or you need platform-specific capabilities a unified layer abstracts away. Use a unified API if publishing is a feature of something else — it collapses nine auth models, media pipelines, and review processes into one HTTP surface.",
    },
    {
      question: "Why do social media API tokens keep expiring?",
      answer:
        "Most platforms issue short-lived tokens that must be exchanged or refreshed on a schedule. Meta's long-lived tokens last around 60 days and must be refreshed before they lapse. Users also revoke access, and password changes invalidate tokens. Detect 401s, mark the connection for reconnection, and stop retrying.",
    },
    {
      question: "How do I avoid duplicate posts when a publish request times out?",
      answer:
        "Use an idempotency key generated before the request and reuse it on every retry, backed by a unique database constraint rather than an in-memory check. A timeout is an ambiguous outcome — the post may well have succeeded — so a blind retry is how duplicates happen.",
    },
  ],
  relatedPaths: [
    { href: "/tools/api", label: "Social0 REST API" },
    { href: "/tools/webhooks", label: "Webhooks" },
    { href: "/developers", label: "Developer resources" },
  ],
  relatedSlugs: [
    "why-scheduled-posts-fail",
    "instagram-api-rate-limits",
    "post-to-social-media-with-ai-agents",
  ],
};
