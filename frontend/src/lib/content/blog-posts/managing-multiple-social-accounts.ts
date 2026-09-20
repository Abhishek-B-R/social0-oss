import type { BlogPost } from "../blog-types";

export const managingMultipleSocialAccounts: BlogPost = {
  slug: "managing-multiple-social-accounts",
  category: "Strategy",
  metaTitle: "Managing Multiple Social Media Accounts: An Agency Workflow",
  metaDescription:
    "How to run social for several clients or brands without losing track — account structure, approval workflows, batching, permissions, and the mistakes that cause wrong-account posts.",
  keywords: [
    "manage multiple social media accounts",
    "social media agency workflow",
    "multi client social media management",
    "social media approval workflow",
    "agency social media tools",
    "social media team permissions",
  ],
  title: "Managing multiple social media accounts without losing the thread",
  excerpt:
    "With several clients across nine networks each, the bottleneck is never creativity — it's handoffs, approvals, and remembering which account you're posting from. A workflow that holds up.",
  datePublished: "2026-09-20",
  readingMinutes: 10,
  body: [
    {
      type: "paragraph",
      text: "One brand on four networks is a content problem. Six clients on six networks each is an **operations** problem, and the two need completely different systems.",
    },
    {
      type: "paragraph",
      text: "The failure modes are specific and predictable: a post goes out from the wrong account, a client says they never approved something, nobody notices a connection broke until a week of posts silently failed. All three are process failures, not attention failures.",
    },
    {
      type: "heading",
      text: "Separate accounts before anything else",
    },
    {
      type: "paragraph",
      text: "The wrong-account post is the classic agency incident, and it is almost always caused by one flat list of thirty connected accounts where picking the wrong chip is one mis-click.",
    },
    {
      type: "paragraph",
      text: "The structural fix is isolation: each client gets its own workspace, with its own connected accounts, its own calendar, and its own members. Switching clients should be a deliberate context switch, not a dropdown among thirty options.",
    },
    {
      type: "list",
      items: [
        "**One workspace per client or brand.** Not per platform, not per campaign.",
        "**Connections belong to the workspace**, so a client's accounts are only visible inside it.",
        "**Members are added per workspace.** A freelancer on two clients sees two, not all six.",
        "**Offboarding is one action** — remove the workspace, and access goes with it.",
      ],
    },
    {
      type: "paragraph",
      text: "Social0's [teams and workspaces](/tools/teams) work this way: accounts and calendars are scoped to the workspace, and each team member's access is granted per workspace rather than globally.",
    },
    {
      type: "heading",
      text: "Roles, so people cannot do the thing you do not want them doing",
    },
    {
      type: "paragraph",
      text: "The common setup gives everyone full access and relies on care. That works until the week someone is covering for someone else.",
    },
    {
      type: "table",
      columns: ["Role", "Should be able to", "Should not"],
      rows: [
        [
          "Admin",
          "Everything: connect accounts, publish, manage members.",
          "—",
        ],
        [
          "Member",
          "Draft, schedule, publish, read analytics.",
          "Manage billing or remove members.",
        ],
        [
          "Community manager",
          "Read and reply to comments and DMs.",
          "Publish new content.",
        ],
        [
          "Analyst",
          "Read analytics and export reports.",
          "Publish, or see the inbox.",
        ],
      ],
    },
    {
      type: "callout",
      title: "The community/analyst split matters more than it looks",
      text: "A community manager replying to comments all day does not need publishing rights, and a reporting contractor does not need inbox access to private DMs. Granting both to everyone is how an agency ends up with an incident that was entirely avoidable.",
    },
    {
      type: "heading",
      text: "Approvals: pick the lightest thing that works",
    },
    {
      type: "paragraph",
      text: "Client sign-off is the step that eats the most calendar time, and over-engineering it is as costly as having none.",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**No approval** — for trusted retainer clients on routine content. Faster, and appropriate more often than agencies admit.",
        "**Single approval** — one named person signs off. Covers most clients. The critical part is that it is *one named person*, not “the client team”, which means nobody.",
        "**Multi-stage** — internal review, then client. Reserve for regulated industries or launches.",
      ],
    },
    {
      type: "paragraph",
      text: "Whatever the shape, two rules matter more than the tooling. **Approve in one place** — scattered feedback across email, Slack, and a spreadsheet is how version confusion starts. And **set a deadline with a default**: “no response by Thursday 5pm means it ships as drafted” prevents the queue silently stalling on someone's inbox.",
    },
    {
      type: "heading",
      text: "Batch by activity, not by client",
    },
    {
      type: "paragraph",
      text: "The instinct is to work client by client — Monday is Client A, Tuesday is Client B. It feels organised and it is slower, because you pay the context-switching cost repeatedly for every activity.",
    },
    {
      type: "paragraph",
      text: "Batching by activity across clients is faster:",
    },
    {
      type: "table",
      columns: ["Block", "What happens"],
      rows: [
        ["Planning (monthly)", "All clients' themes and key dates in one sitting."],
        ["Writing (weekly)", "All copy for all clients in one writing session."],
        ["Design / media (weekly)", "All assets in one block, in one tool."],
        ["Scheduling (weekly)", "Everything loaded into queues at once."],
        ["Inbox (daily, timeboxed)", "Comments and DMs across all clients."],
        ["Reporting (monthly)", "All client reports back to back."],
      ],
    },
    {
      type: "paragraph",
      text: "The exception is the inbox, which cannot be batched weekly — replies lose most of their value after a day. Timebox it daily instead.",
    },
    {
      type: "cta",
      text: "One calendar per client, one queue, one place to schedule everything.",
      href: "/tools/teams",
      label: "See teams & workspaces",
    },
    {
      type: "heading",
      text: "The failure nobody catches: silent connection death",
    },
    {
      type: "paragraph",
      text: "This is the one that costs agencies clients. A platform token expires — a password change, a revoked permission, a Meta token lapsing after its window — and every scheduled post to that account fails. If nobody is watching, you find out when the client asks why nothing has posted for nine days.",
    },
    {
      type: "paragraph",
      text: "It is worse at agency scale because you are not looking at any single account daily. Six clients across six networks is thirty-six connections, each with its own expiry.",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Treat an auth failure as a reconnect, not a retry.** A dead token will fail identically on every retry; what it needs is a human reauthorising it.",
        "**Get failures pushed to you**, not pulled. Failure emails or webhooks into the channel you already watch beats remembering to check a dashboard.",
        "**Check connection health weekly** as an explicit task with a named owner. Fifteen minutes.",
        "**Know which accounts expire on a clock.** Meta's long-lived tokens lapse after roughly sixty days without refresh — those are your recurring offenders.",
      ],
    },
    {
      type: "paragraph",
      text: "The deeper point: at scale you need per-platform, per-account publish status rather than a single post-level “sent” flag. A post that reached four of six accounts needs to show you the two that failed. [Why scheduled posts fail](/blog/why-scheduled-posts-fail) covers the mechanics.",
    },
    {
      type: "heading",
      text: "Reporting without spending a week on it",
    },
    {
      type: "list",
      items: [
        "**Same metrics, same definitions, every client.** Comparability is the whole value; bespoke reports per client destroy it and triple the work.",
        "**Report against the client's goal**, not a generic dashboard. If they hired you for inbound leads, follower count is a vanity line.",
        "**Include what did not work.** It builds more trust than an all-green report, and it is the setup for next month's plan.",
        "**Automate the pull, write the interpretation.** The numbers should arrive on their own; the two paragraphs explaining them are the part worth your time. An [API or CLI](/tools/api) can pull the numbers into your own template on a schedule.",
      ],
    },
    {
      type: "heading",
      text: "The short version",
    },
    {
      type: "list",
      items: [
        "One workspace per client, with scoped connections and members.",
        "Roles that match what people actually do — community and analyst are not admins.",
        "The lightest approval flow that the client will genuinely use, with a deadline default.",
        "Batch by activity across clients, except the inbox.",
        "Monitor connection health deliberately; silent token death is the expensive failure.",
        "One reporting template, consistently applied.",
      ],
    },
    {
      type: "paragraph",
      text: "None of it is clever. It is the difference between an agency that scales past four clients and one that does not.",
    },
  ],
  faq: [
    {
      question: "How do agencies manage multiple social media accounts?",
      answer:
        "With one workspace per client, each holding its own connected accounts, calendar, and members. Isolation is what prevents the classic wrong-account post, and it makes offboarding a single action rather than an audit of thirty connections.",
    },
    {
      question: "What roles should a social media team have?",
      answer:
        "At minimum: admins who manage accounts and members, members who draft and publish, community managers who reply to comments and DMs without publishing rights, and analysts who read reporting without inbox access. Giving everyone full access works until someone covers for someone else.",
    },
    {
      question: "How should client approval workflows work?",
      answer:
        "Use the lightest flow the client will actually use — often a single named approver rather than a committee. Keep feedback in one place rather than scattered across email and chat, and set a deadline with a default so the queue does not stall on an unanswered message.",
    },
    {
      question: "Should I batch social media work by client or by task?",
      answer:
        "By task. Writing all clients' copy in one session is faster than working client by client, because you pay the context-switching cost once per activity instead of once per client. The exception is the inbox, where replies lose value after a day and need daily timeboxed attention.",
    },
    {
      question: "Why do scheduled posts stop working for some client accounts?",
      answer:
        "Usually an expired platform token, from a password change, a revoked permission, or a Meta token lapsing after roughly sixty days. It needs reauthorising, not retrying. At agency scale, with dozens of connections each on their own expiry clock, this needs an explicit weekly check and failure alerts pushed to you.",
    },
  ],
  relatedPaths: [
    { href: "/tools/teams", label: "Teams & workspaces" },
    { href: "/tools/queue", label: "Posting queue" },
    { href: "/tools/bulk-image", label: "Bulk scheduling" },
    { href: "/pricing", label: "Pricing" },
  ],
  relatedSlugs: [
    "social-media-content-calendar",
    "why-scheduled-posts-fail",
    "connect-social-accounts-troubleshooting",
  ],
};
