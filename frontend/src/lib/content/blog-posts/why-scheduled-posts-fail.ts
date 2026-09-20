import type { BlogPost } from "../blog-types";

export const whyScheduledPostsFail: BlogPost = {
  slug: "why-scheduled-posts-fail",
  category: "Engineering",
  metaTitle: "Why Scheduled Social Posts Fail (and How to Build So They Don't)",
  metaDescription:
    "Expired tokens, ambiguous timeouts, duplicate posts, and partial failures — the real failure modes of scheduled publishing, and the idempotency and retry design that prevents them.",
  keywords: [
    "scheduled post failed",
    "social media publishing reliability",
    "duplicate social media posts",
    "idempotency key publishing",
    "webhook retry social",
    "partial publish failure",
  ],
  title: "Why scheduled posts fail — and how to build so they don't",
  excerpt:
    "A post that publishes twice is worse than one that does not publish at all. A tour of the failure modes in scheduled publishing, why retries cause most of them, and the design that actually holds up.",
  datePublished: "2026-09-16",
  dateModified: "2026-09-20",
  readingMinutes: 12,
  body: [
    {
      type: "paragraph",
      text: "Scheduled publishing looks like a cron job that calls an API. It is not. It is a distributed system where the remote side is nine third-party APIs you do not control, each with its own timeouts, quotas, and creative interpretations of HTTP status codes.",
    },
    {
      type: "paragraph",
      text: "Here is what actually goes wrong, in rough order of how often it does.",
    },
    {
      type: "heading",
      text: "1. Expired tokens",
    },
    {
      type: "paragraph",
      text: "The most common failure by a wide margin, and the most misdiagnosed. A user connects an account, schedules a month of content, and the token dies in week two. Every remaining job fails identically.",
    },
    {
      type: "paragraph",
      text: "The mistake is classifying this as a transient error. It is not — it is a **reconnect**. Retrying with backoff will fail three times and then give up, having told the user nothing useful.",
    },
    {
      type: "callout",
      title: "Three error classes, three behaviours",
      text: "**Retry** (429, 5xx, network): back off and try again. **Reconnect** (401, X error 89): stop retrying, mark the connection dead, tell the user. **Fix input** (4xx for oversized video, bad ratio, too-long caption): stop, and say what to change. Collapsing these into one path is the root cause of most bad publishing behaviour.",
    },
    {
      type: "paragraph",
      text: "Proactive refresh helps but does not eliminate the problem — users revoke access, change passwords, and delete Pages. Detection and a clear reconnect prompt are what you actually need.",
    },
    {
      type: "heading",
      text: "2. The ambiguous timeout",
    },
    {
      type: "paragraph",
      text: "This is the one that produces the worst outcome. You POST a publish request. The connection times out at 30 seconds. You do not know whether the platform received it.",
    },
    {
      type: "paragraph",
      text: "If you retry and the original succeeded, the user gets **two identical posts** on their feed. If you do not retry and the original failed, the post silently never happens. Neither is acceptable, and you cannot tell from the timeout which situation you are in.",
    },
    {
      type: "subheading",
      text: "Idempotency keys",
    },
    {
      type: "paragraph",
      text: "The fix is the same one payment systems use. Generate a stable key **before** the first attempt, tied to the logical operation — this post, this platform account — and reuse it on every retry:",
    },
    {
      type: "code",
      language: "typescript",
      code: `// Derived once, at job creation. Stable across every retry.
const idempotencyKey = \`\${postId}:\${accountId}\`;

// The unique constraint is what actually enforces this.
// An in-memory check loses to two concurrent workers.
await db.insert(publishAttempts)
  .values({ idempotencyKey, postId, accountId, status: "in_flight" })
  .onConflictDoNothing();`,
    },
    {
      type: "paragraph",
      text: "Two details matter more than the code:",
    },
    {
      type: "list",
      items: [
        "**The uniqueness must be enforced by the database**, not application logic. Two workers can pick up the same job within microseconds of each other; only a unique constraint reliably resolves that race.",
        "**The key must be generated before the first attempt**, not on retry. A key generated per-attempt is not an idempotency key, it is a request id.",
      ],
    },
    {
      type: "subheading",
      text: "Reconciliation for what slips through",
    },
    {
      type: "paragraph",
      text: "Some platforms do not support idempotency keys at all. For those, the fallback is reconciliation: after an ambiguous failure, query the platform for recent posts from that account and check whether yours is already there. If it is, record the remote id and mark the job succeeded rather than retrying.",
    },
    {
      type: "paragraph",
      text: "This is not elegant, but it is what makes “published but we failed to record it” recoverable rather than a permanent inconsistency.",
    },
    {
      type: "heading",
      text: "3. Partial failure is the normal case",
    },
    {
      type: "paragraph",
      text: "A post going to five accounts is five independent operations. Three succeeding and two failing is not an edge case — it is Tuesday.",
    },
    {
      type: "paragraph",
      text: "The design consequence is a data model one: a post cannot have a single status column. It needs a per-platform publication record, each with its own status, remote id, error, and timestamp. The post-level status is then **derived** — published when all succeed, partial when some do, failed when none do.",
    },
    {
      type: "table",
      columns: ["Anti-pattern", "Why it hurts", "Instead"],
      rows: [
        [
          "One status field on the post",
          "Cannot represent 3-of-5. You end up picking a lie.",
          "Per-publication rows, derived post status.",
        ],
        [
          "Fail the whole post if one platform fails",
          "Throws away four successful publishes.",
          "Fan out independently; let each fail alone.",
        ],
        [
          "Retry the whole post",
          "Re-posts to the platforms that already succeeded.",
          "Retry only the failed publication.",
        ],
        [
          "One generic error message",
          "User cannot tell a reconnect from an oversized video.",
          "Per-platform error, classified and actionable.",
        ],
      ],
    },
    {
      type: "cta",
      text: "Per-platform publish status, with retry on just the account that failed.",
      href: "/features/multi-platform-scheduler",
      label: "See how fan-out works",
    },
    {
      type: "heading",
      text: "4. Long-running work in a request handler",
    },
    {
      type: "paragraph",
      text: "Video publishing can take minutes — chunked upload, then platform-side processing, then the publish call. Doing that inside an HTTP handler means the request times out, the client retries, and now you have two upload jobs.",
    },
    {
      type: "paragraph",
      text: "The rule is the one every webhook guide also arrives at: **acknowledge fast, process asynchronously.** Return 202 with a tracking id immediately, do the work in a queue, and let the caller poll or receive a webhook. Social0 returns a tracking id on publish and streams per-platform progress over SSE for exactly this reason.",
    },
    {
      type: "callout",
      title: "The serverless variant",
      text: "On edge runtimes the same mistake takes a different shape: fire-and-forget work after the response. The isolate is torn down when the response returns, so a non-awaited email or webhook call simply never leaves. If it must happen, it must be awaited before the handler returns.",
    },
    {
      type: "heading",
      text: "5. Outbound webhooks that lose events",
    },
    {
      type: "paragraph",
      text: "If you notify customers when a publish completes, that delivery is its own reliability problem — and usually a worse-built one, because it feels like a side effect.",
    },
    {
      type: "paragraph",
      text: "A webhook delivery system needs, at minimum:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Retries with backoff** on 5xx, 408, 425, 429, and network errors — and **no retry** on other 4xx, which mean the receiver rejected the payload and will keep rejecting it.",
        "**A stable event id** that survives retries, so the receiver can deduplicate.",
        "**Signed payloads**, so the receiver can verify the request came from you.",
        "**SSRF checks on every redirect hop**, not just the initial URL. A customer-supplied webhook URL that 302s to `169.254.169.254` is a credential-theft attempt, and checking only the first URL misses it.",
        "**A delivery log**, so “we never got the webhook” has an answer other than a shrug.",
        "**A dead-letter path** for events that exhaust retries.",
      ],
    },
    {
      type: "paragraph",
      text: "The SSRF point deserves emphasis because it is routinely missed. Any system that fetches a URL supplied by a user must validate the resolved address at every hop, not the hostname once.",
    },
    {
      type: "heading",
      text: "6. Clock and time zone bugs",
    },
    {
      type: "paragraph",
      text: "Quieter than the rest, and they surface at the worst moments.",
    },
    {
      type: "list",
      items: [
        "**Store UTC, display local.** Storing local time means a DST transition moves every scheduled post by an hour.",
        "**Handle the DST gap.** In a spring-forward transition, 02:30 does not exist. A post scheduled for a time that never occurs needs a defined behaviour, not an exception.",
        "**Decide what a late job does.** If a worker was down and a job is now two hours overdue, should it publish or skip? Both are defensible; having no answer is not.",
        "**Beware “publish at exactly 09:00”.** Everyone schedules on the hour. A thundering herd at :00 is self-inflicted — jitter within the minute.",
      ],
    },
    {
      type: "heading",
      text: "A checklist",
    },
    {
      type: "paragraph",
      text: "If you are building or evaluating a publishing system, these are the questions that matter:",
    },
    {
      type: "list",
      items: [
        "Does a timeout on publish risk a duplicate post? (Idempotency key with a database-enforced constraint.)",
        "Does one platform failing take down the others? (Independent fan-out.)",
        "Can a user retry just the account that failed? (Per-publication records.)",
        "Does an expired token look different from a network blip? (Error classification.)",
        "Does a long video upload block an HTTP handler? (Async jobs, tracking id, 202.)",
        "Is there a per-platform error a human can act on? (Not “publish failed”.)",
        "If a webhook receiver is down for an hour, are those events lost? (Retries and a dead-letter path.)",
        "Does a DST transition move scheduled posts? (UTC storage.)",
      ],
    },
    {
      type: "paragraph",
      text: "None of this is exotic. It is the ordinary discipline of building against APIs you do not control — but the cost of skipping it is unusually visible here, because the failure mode is public and permanent. A duplicate post cannot be rolled back.",
    },
  ],
  faq: [
    {
      question: "Why did my scheduled social media post fail?",
      answer:
        "Most often an expired platform token — the connection needs reauthorising rather than retrying. Other common causes are hitting a platform's publishing rate limit, media that exceeds a duration or file size limit, and a caption over the platform's character limit.",
    },
    {
      question: "Why do scheduled posts sometimes publish twice?",
      answer:
        "A request timed out after the platform had already accepted it, and the retry created a second post. The fix is an idempotency key generated before the first attempt and enforced by a database unique constraint, so a retry is recognised as the same logical operation.",
    },
    {
      question: "What is an idempotency key in social media publishing?",
      answer:
        "A stable identifier for one logical publish — typically derived from the post id and the target account — that is reused across every retry. Backed by a unique constraint, it lets the system recognise a retry as the same operation instead of creating a duplicate post.",
    },
    {
      question: "What happens when a post publishes to some platforms but not others?",
      answer:
        "That is a partial publish, and it should be a first-class state. Each platform gets its own publication record with its own status and error, the post status is derived from them, and you can retry only the account that failed without reposting to the ones that succeeded.",
    },
    {
      question: "How should a publishing system handle webhook delivery failures?",
      answer:
        "Retry on 5xx, 408, 425, 429, and network errors with exponential backoff, but never on other 4xx. Send a stable event id so receivers can deduplicate, sign the payload, validate the destination against SSRF on every redirect hop, log every attempt, and dead-letter events that exhaust retries.",
    },
  ],
  relatedPaths: [
    { href: "/tools/webhooks", label: "Webhooks" },
    { href: "/tools/api", label: "REST API" },
    { href: "/features/multi-platform-scheduler", label: "Multi-platform scheduler" },
  ],
  relatedSlugs: [
    "social-media-posting-api-guide",
    "instagram-api-rate-limits",
    "social-media-automation-for-developers",
  ],
};
