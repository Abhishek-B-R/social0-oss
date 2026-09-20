import type { BlogPost } from "../blog-types";

export const socialMediaAutomationForDevelopers: BlogPost = {
  slug: "social-media-automation-for-developers",
  category: "AI & automation",
  metaTitle: "Social Media Automation for Developers: CLI, CI, and Webhooks",
  metaDescription:
    "Automate posting from release pipelines, cron jobs, and your own apps — announce releases from CI, turn changelogs into threads, and wire publish events back into your systems.",
  keywords: [
    "social media automation developers",
    "automate social media posting",
    "social media cli",
    "post from ci pipeline",
    "changelog to social media",
    "automate release announcements",
  ],
  title: "Social media automation for developers: CLI, CI, and webhooks",
  excerpt:
    "If you ship software, you already have the triggers — releases, deploys, changelogs, milestones. Here's how to turn them into posts without adding a manual step to your release process.",
  datePublished: "2026-09-18",
  dateModified: "2026-09-20",
  readingMinutes: 10,
  body: [
    {
      type: "paragraph",
      text: "Developer marketing has an awkward shape: the interesting things happen in your repo, and the audience is somewhere else. The gap is usually bridged by somebody remembering to write a post after the release goes out — which works until the week it does not.",
    },
    {
      type: "paragraph",
      text: "The alternative is treating publishing as part of the pipeline, the same way you treat release notes or a changelog entry.",
    },
    {
      type: "heading",
      text: "Triggers you already have",
    },
    {
      type: "table",
      columns: ["Event", "Post", "Where it fires"],
      rows: [
        ["Tagged release", "What shipped and why it matters", "Release workflow"],
        ["Merged PR with a label", "A short build-in-public note", "PR merge hook"],
        ["Changelog entry", "A thread of the highlights", "Docs build"],
        ["Milestone (stars, users, uptime)", "A numbers post", "Scheduled job"],
        ["New blog post or doc page", "Announcement plus a quote thread", "Content pipeline"],
        ["Status recovery", "A short incident-resolved note", "Monitoring webhook"],
      ],
    },
    {
      type: "callout",
      title: "Automate the trigger, not the judgement",
      text: "The reliable pattern is **automate to a draft or a scheduled post, not to a live one**. The pipeline creates the post; a human glances at it before it goes out. You get consistency without the risk of an automated post going out during an outage.",
    },
    {
      type: "heading",
      text: "Announcing a release from CI",
    },
    {
      type: "paragraph",
      text: "The simplest useful automation. On a tagged release, schedule a post for the next morning rather than firing immediately — releases often land at 11pm, and that is not when you want the announcement.",
    },
    {
      type: "code",
      language: "yaml",
      code: `name: Announce release

on:
  release:
    types: [published]

jobs:
  announce:
    runs-on: ubuntu-latest
    steps:
      - name: Schedule the announcement
        env:
          SOCIAL0_API_KEY: \${{ secrets.SOCIAL0_API_KEY }}
        run: |
          npx social0 schedule \\
            --content "\${{ github.event.release.name }} is out.

\${{ github.event.release.body }}

Release notes: \${{ github.event.release.html_url }}" \\
            --accounts linkedin,twitter_x,bluesky \\
            --at "tomorrow 09:00"`,
    },
    {
      type: "paragraph",
      text: "Two things to get right here. Release bodies can be long and contain Markdown that reads badly as a social post, so truncate and strip it rather than pasting raw. And put the API key in your CI secret store, never in the workflow file.",
    },
    {
      type: "heading",
      text: "Turning a changelog into a thread",
    },
    {
      type: "paragraph",
      text: "A release with six bullet points is a thread, not a post. One bullet per entry, with the first post carrying the framing:",
    },
    {
      type: "code",
      language: "bash",
      code: `#!/usr/bin/env bash
set -euo pipefail

VERSION="$1"
# Pull the bullets for this version out of CHANGELOG.md
BULLETS=$(awk "/^## \\[?\${VERSION}/{f=1;next}/^## /{f=0}f" CHANGELOG.md \\
  | grep '^- ' | sed 's/^- //')

# First post frames it, one post per bullet after that
{
  echo "What shipped in \${VERSION}:"
  echo "$BULLETS"
} | social0 thread create --accounts twitter_x,bluesky,threads --stdin`,
    },
    {
      type: "paragraph",
      text: "X, Bluesky, and Threads all support native threads, so one source produces three native thread posts. See [the CLI](/tools/cli) for the full command surface.",
    },
    {
      type: "heading",
      text: "Publishing from your own application",
    },
    {
      type: "paragraph",
      text: "When posting is a feature of something you are building — a CMS that announces on publish, an internal tool, a customer-facing scheduler — the REST API is the right surface.",
    },
    {
      type: "code",
      language: "typescript",
      code: `const res = await fetch("https://api.social0.app/v1/posts", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.SOCIAL0_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    content: \`New on the blog: \${post.title}\\n\\n\${post.url}\`,
    account_ids: accountIds,
    scheduled_at: nextWeekdayMorning().toISOString(),
  }),
});

if (!res.ok) {
  // 401 -> reconnect, 429 -> back off, 4xx -> fix the payload.
  // Do not retry all three the same way.
  throw new Error(\`Publish failed: \${res.status} \${await res.text()}\`);
}

const { tracking_id } = await res.json();`,
    },
    {
      type: "paragraph",
      text: "The `tracking_id` is what makes this debuggable later. Store it against whatever triggered the post, and when someone asks why Tuesday's announcement never appeared you can answer from your own logs.",
    },
    {
      type: "heading",
      text: "Closing the loop with webhooks",
    },
    {
      type: "paragraph",
      text: "Publishing is asynchronous — the API accepts the job and platforms finish at their own pace. Polling works, but webhooks are better: you get `post.published` and `post.failed` when each post reaches a terminal state.",
    },
    {
      type: "paragraph",
      text: "Worth wiring up for:",
    },
    {
      type: "list",
      items: [
        "**Alerting on failure.** A failed release announcement should show up where your team already looks, not in an email nobody reads.",
        "**Recording permalinks.** The success event carries the platform URL. Store it next to the release so the link is available later.",
        "**Detecting dead connections early.** A `post.failed` with an auth error means an expired token. Catching that on a low-stakes post is much better than on launch day.",
      ],
    },
    {
      type: "paragraph",
      text: "If you are writing the receiver, the usual rules apply: verify the signature, return 2xx fast and process asynchronously, and deduplicate on the event id because a retried delivery is a normal occurrence, not a bug. [Webhooks](/tools/webhooks) covers the payloads and the retry policy.",
    },
    {
      type: "cta",
      text: "API keys, an OpenAPI spec, a CLI, and signed webhooks.",
      href: "/developers",
      label: "Developer resources",
    },
    {
      type: "heading",
      text: "A cron job for evergreen content",
    },
    {
      type: "paragraph",
      text: "Not everything is event-driven. A weekly job that picks an evergreen post — a doc page, a good old thread, a tip — and queues it keeps a baseline cadence running underneath your release-driven posts.",
    },
    {
      type: "paragraph",
      text: "Two rules keep this from becoming spam: track what has already been posted so the same item does not resurface twice in a quarter, and cap it so automated posts never outnumber human ones in a given week. [Auto-repost](/tools/auto-repost) does this without you writing the job, with an interval and a maximum resurface count.",
    },
    {
      type: "heading",
      text: "Guardrails worth having",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Schedule, don't publish.** A scheduled post is editable until it fires. That window has caught more bad automated posts than any review process.",
        "**A kill switch.** One environment variable that disables all automated publishing. You will want it during an incident, and you will want it immediately.",
        "**Separate credentials.** A distinct API key per automation, so revoking CI access does not break your app.",
        "**Rate-limit yourself.** A retry loop that posts on every attempt is a way to put nine identical posts on your own feed. Make the publish path idempotent — see [why scheduled posts fail](/blog/why-scheduled-posts-fail).",
        "**Don't auto-post during an incident.** A cheerful feature announcement while your status page is red is the worst possible timing. Gate automated posts on your own health check.",
      ],
    },
    {
      type: "paragraph",
      text: "That last one sounds obvious and is the single most common embarrassing failure in automated developer marketing.",
    },
    {
      type: "heading",
      text: "Where to start",
    },
    {
      type: "paragraph",
      text: "Do not build the whole pipeline. Start with the release announcement, because it is the highest-value trigger and the easiest to get right: one workflow step, scheduled rather than immediate, to a draft you glance at.",
    },
    {
      type: "paragraph",
      text: "Once that has run for a month without surprising you, add the changelog thread. The rest is optional.",
    },
  ],
  faq: [
    {
      question: "How do I automatically post to social media when I publish a release?",
      answer:
        "Add a step to your release workflow that calls a publishing API or CLI with the release name, notes, and URL. Schedule the post for the next morning rather than publishing immediately — releases often land late at night, which is not when you want the announcement going out.",
    },
    {
      question: "Should automated posts publish immediately or be scheduled?",
      answer:
        "Scheduled. A scheduled post stays editable until it fires, which gives you a free review window and prevents an automated announcement going out during an outage or at a bad hour. Reserve immediate publishing for cases where someone is watching.",
    },
    {
      question: "How do I know if an automated post failed?",
      answer:
        "Subscribe to publish webhooks. A post.failed event tells you which platform failed and why, so you can route it to wherever your team already looks. It is also the earliest signal that a platform token has expired.",
    },
    {
      question: "How do I avoid posting duplicates from a retrying CI job?",
      answer:
        "Make the publish path idempotent by deriving a stable key from whatever triggered it — the release tag, the commit SHA — and reusing it on retries. A CI job that retries on network failure will otherwise post the same announcement several times.",
    },
    {
      question: "What is the difference between the CLI, the API, and MCP for automation?",
      answer:
        "The CLI is for scripts and CI pipelines, the REST API is for applications you are building, and MCP is for conversational AI agents. All three hit the same publishing pipeline, so posts created through any of them behave identically.",
    },
  ],
  relatedPaths: [
    { href: "/tools/cli", label: "Social0 CLI" },
    { href: "/tools/api", label: "REST API" },
    { href: "/tools/webhooks", label: "Webhooks" },
    { href: "/developers", label: "Developer resources" },
  ],
  relatedSlugs: [
    "post-to-social-media-with-ai-agents",
    "social-media-posting-api-guide",
    "why-scheduled-posts-fail",
  ],
};
