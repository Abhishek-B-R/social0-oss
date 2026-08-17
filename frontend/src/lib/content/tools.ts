export type ToolPage = {
  slug: string;
  label: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  heroHeadline: string;
  heroSubheadline: string;
  intro: string;
  benefits: { title: string; description: string }[];
  howItWorks: { step: number; title: string; description: string }[];
  faq: { question: string; answer: string }[];
  /** Primary CTA path (in-app) or external docs URL */
  ctaHref: string;
  ctaLabel: string;
  docsHref?: string;
};

export const TOOLS: ToolPage[] = [
  {
    slug: "api",
    label: "API",
    metaTitle: "Social Media Publishing API | Social0",
    metaDescription:
      "REST API to create drafts, upload media, publish, and schedule across 9 platforms with API keys and webhooks.",
    keywords: [
      "social media api",
      "publish api",
      "schedule posts api",
      "social0 api",
    ],
    heroHeadline: "HTTP API for drafts, media, and multi-platform publish",
    heroSubheadline:
      "Ship posting workflows from your backend or agent. Bearer API keys, media uploads, jobs, and webhooks.",
    intro:
      "Social0’s public /v1 API lets you create drafts, attach media, publish now, or schedule — while Social0 owns OAuth, platform quirks, and parallel fan-out across LinkedIn, X, Instagram, TikTok, YouTube, and more.",
    benefits: [
      {
        title: "API keys in the dashboard",
        description:
          "Create sk_live_ keys under Developer settings and authenticate with Authorization: Bearer.",
      },
      {
        title: "Media + posts + jobs",
        description:
          "Presign uploads, create posts, publish or schedule, then poll job status until platforms finish.",
      },
      {
        title: "Outbound webhooks",
        description:
          "Get signed events when publishes succeed or fail so your systems stay in sync.",
      },
      {
        title: "Same stack as the app",
        description:
          "The API uses the same publish pipeline as the dashboard — Cloudflare edge publish and finalization.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Create an API key",
        description: "Open Dashboard → API keys and mint a live key.",
      },
      {
        step: 2,
        title: "Connect accounts",
        description:
          "OAuth still happens in the UI; the API publishes to accounts you already connected.",
      },
      {
        step: 3,
        title: "Call /v1",
        description:
          "Create posts, upload media, publish or schedule, and subscribe to webhooks.",
      },
    ],
    faq: [
      {
        question: "Where is the API documentation?",
        answer:
          "Full reference and quickstart live at docs.social0.app under the API section.",
      },
      {
        question: "Can agents use the API?",
        answer:
          "Yes. Many teams use the REST API from scripts; for chat agents prefer MCP.",
      },
    ],
    ctaHref: "/dashboard/api-keys",
    ctaLabel: "Open API keys",
    docsHref: "https://docs.social0.app/docs/api",
  },
  {
    slug: "cli",
    label: "AI Agents CLI",
    metaTitle: "Social0 CLI — Publish from the Terminal | Social0",
    metaDescription:
      "Official social0 CLI for accounts, drafts, media, and publishing. Built for agents and automation.",
    keywords: ["social0 cli", "social media cli", "publish from terminal"],
    heroHeadline: "Official CLI for agents and power users",
    heroSubheadline:
      "Install social0, set your API key, and publish or schedule without opening the dashboard.",
    intro:
      "The Social0 CLI wraps the same /v1 surface as the API. Use it from shells, CI, or agent runtimes that prefer command-line tools over HTTP SDKs.",
    benefits: [
      {
        title: "npm install -g social0",
        description: "One package. Authenticate with SOCIAL0_API_KEY.",
      },
      {
        title: "Accounts, posts, media",
        description:
          "List connected accounts, create drafts, upload media, publish and schedule.",
      },
      {
        title: "Agent-friendly",
        description:
          "Deterministic commands and JSON-friendly output for Claude Code, Codex, and custom agents.",
      },
      {
        title: "Same platforms as the app",
        description:
          "Anything you can post in the dashboard can be driven from the CLI once accounts are connected.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Install the CLI",
        description: "Run npm install -g social0 (or npx social0).",
      },
      {
        step: 2,
        title: "Export your key",
        description: "Set SOCIAL0_API_KEY from Dashboard → API keys.",
      },
      {
        step: 3,
        title: "Publish",
        description: "Create content, attach media if needed, then publish or schedule.",
      },
    ],
    faq: [
      {
        question: "Is the CLI separate from MCP?",
        answer:
          "Yes. MCP is for chat agents over Model Context Protocol. The CLI is for terminal and script workflows.",
      },
    ],
    ctaHref: "/dashboard/api-keys",
    ctaLabel: "Get an API key",
    docsHref: "https://docs.social0.app/docs/integrations/cli",
  },
  {
    slug: "webhooks",
    label: "Webhooks",
    metaTitle: "Publish Webhooks | Social0",
    metaDescription:
      "Subscribe to signed Social0 webhooks for publish success and failure events.",
    keywords: ["social media webhooks", "publish webhooks", "social0 webhooks"],
    heroHeadline: "Signed webhooks when posts go live — or fail",
    heroSubheadline:
      "Keep your CRM, Notion, or agent loop in sync without polling forever.",
    intro:
      "Outbound webhooks notify your endpoint when publish jobs complete. Verify signatures, then update your own systems.",
    benefits: [
      {
        title: "Event-driven",
        description: "React to success and failure instead of busy-waiting on job polls.",
      },
      {
        title: "Signed payloads",
        description: "Verify authenticity before trusting event bodies.",
      },
      {
        title: "Managed in-app",
        description: "Create and rotate webhook endpoints from the developer area.",
      },
      {
        title: "Pairs with API & MCP",
        description:
          "Kick off publishes from API/MCP, then finish the workflow when the webhook arrives.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Add an endpoint",
        description: "Register your HTTPS URL in Dashboard → API keys / webhooks.",
      },
      {
        step: 2,
        title: "Publish content",
        description: "Use the dashboard, API, CLI, or MCP as usual.",
      },
      {
        step: 3,
        title: "Handle the event",
        description: "Verify the signature and update your product state.",
      },
    ],
    faq: [
      {
        question: "Where are webhook docs?",
        answer: "See docs.social0.app under API → Webhooks for events and verification.",
      },
    ],
    ctaHref: "/dashboard/api-keys",
    ctaLabel: "Configure webhooks",
    docsHref: "https://docs.social0.app/docs/api/webhooks",
  },
  {
    slug: "bulk-image",
    label: "Bulk image tools",
    metaTitle: "Bulk Image Scheduling | Social0",
    metaDescription:
      "Upload many images and schedule them across days. Growth+ bulk image tools in Social0.",
    keywords: ["bulk image scheduling", "batch schedule images", "social0 bulk tools"],
    heroHeadline: "Schedule a week of images in one sitting",
    heroSubheadline:
      "Bulk image tools for creators who batch-shoot and want the calendar filled fast.",
    intro:
      "Upload a set of images, map captions and accounts, and drop them onto your schedule. Built for Growth and higher plans.",
    benefits: [
      {
        title: "Many files at once",
        description: "Skip one-by-one create flows when you already have a content batch.",
      },
      {
        title: "Calendar-aware",
        description: "Spread posts across days instead of dumping everything now.",
      },
      {
        title: "Multi-platform",
        description: "Target the accounts you already connected in Social0.",
      },
      {
        title: "Same media pipeline",
        description: "Uploads go through R2 and the normal publish path.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Open bulk tools",
        description: "Dashboard → Bulk tools → Images (Growth+).",
      },
      {
        step: 2,
        title: "Upload & caption",
        description: "Add images, captions, and target accounts.",
      },
      {
        step: 3,
        title: "Schedule",
        description: "Pick dates/times and save to the calendar.",
      },
    ],
    faq: [
      {
        question: "Which plan includes bulk image tools?",
        answer: "Bulk tools are available on Growth and higher plans.",
      },
    ],
    ctaHref: "/dashboard/bulk-tools",
    ctaLabel: "Open bulk tools",
    docsHref: "https://docs.social0.app/docs/dashboard/bulk-tools/image",
  },
  {
    slug: "bulk-video",
    label: "Bulk video tools",
    metaTitle: "Bulk Video Scheduling | Social0",
    metaDescription:
      "Batch upload and schedule videos across platforms. Social0 bulk video tools (Growth+).",
    keywords: ["bulk video scheduling", "batch schedule videos", "shorts scheduler"],
    heroHeadline: "Batch schedule Shorts, Reels, and TikToks",
    heroSubheadline:
      "Drop a folder of videos into Social0 and fill the calendar without babysitting uploads.",
    intro:
      "Bulk video tools handle larger files and platform limits while still using Social0’s edge publish worker.",
    benefits: [
      {
        title: "Designed for video",
        description: "Handles larger uploads and duration checks before you schedule.",
      },
      {
        title: "Aspect-ratio hints",
        description: "Guidance before you ship a vertical that will look wrong on a platform.",
      },
      {
        title: "Parallel publish",
        description: "When it goes live, platforms are updated in parallel like any other post.",
      },
      {
        title: "Growth+ feature",
        description: "Included with Growth and Pro plan tiers.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Open bulk video",
        description: "Dashboard → Bulk tools → Video.",
      },
      {
        step: 2,
        title: "Upload videos",
        description: "Add files, captions, and accounts.",
      },
      {
        step: 3,
        title: "Schedule the batch",
        description: "Assign times and confirm.",
      },
    ],
    faq: [
      {
        question: "Can I publish to YouTube and TikTok from bulk tools?",
        answer:
          "Yes, if those accounts are connected and the content type is supported for that platform.",
      },
    ],
    ctaHref: "/dashboard/bulk-tools",
    ctaLabel: "Open bulk tools",
    docsHref: "https://docs.social0.app/docs/dashboard/bulk-tools/video",
  },
  {
    slug: "auto-repost",
    label: "Auto-repost",
    metaTitle: "Auto-Repost / Resurface Content | Social0",
    metaDescription:
      "Automatically resurface evergreen posts on an interval with Social0 auto-repost.",
    keywords: ["auto repost", "resurface content", "evergreen scheduling"],
    heroHeadline: "Resurface evergreen posts on autopilot",
    heroSubheadline:
      "Set an interval and max resurfaces. Social0 brings strong posts back without manual copy-paste.",
    intro:
      "Auto-repost (resurface) is for evergreen content that still deserves airtime. Configure per post from the composer or post detail on eligible plans.",
    benefits: [
      {
        title: "Interval + max runs",
        description: "Control how often and how many times a post resurfaces.",
      },
      {
        title: "Optional plug comment",
        description: "Add a short follow-up comment when content resurfaces.",
      },
      {
        title: "Works with your calendar",
        description: "Resurfaces are scheduled work — not surprise spam at random hours.",
      },
      {
        title: "Growth automation",
        description: "Available on Growth and higher tiers.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Compose or open a post",
        description: "Use schedule flow or post detail for eligible posts.",
      },
      {
        step: 2,
        title: "Enable auto-repost",
        description: "Set interval, max resurfaces, and optional plug text.",
      },
      {
        step: 3,
        title: "Let it run",
        description: "Background workers enqueue resurfaces on schedule.",
      },
    ],
    faq: [
      {
        question: "Is auto-repost the same as auto-plug?",
        answer:
          "No. Auto-repost resurfaces the post. Auto-plug adds a reply when engagement thresholds are hit.",
      },
    ],
    ctaHref: "/pricing",
    ctaLabel: "See Growth plan",
  },
  {
    slug: "auto-plug",
    label: "Auto-plug",
    metaTitle: "Auto-Plug Engagement Replies | Social0",
    metaDescription:
      "Add a CTA reply automatically when a post hits engagement thresholds. Social0 auto-plug.",
    keywords: ["auto plug", "engagement reply", "social media automation"],
    heroHeadline: "Drop a CTA reply when the post starts working",
    heroSubheadline:
      "Auto-plug watches metrics and posts your follow-up so you don’t miss the moment.",
    intro:
      "Auto-plug is built for platforms like X where a timely reply converts attention into clicks. Configure thresholds and the plug comment when you schedule.",
    benefits: [
      {
        title: "Threshold-based",
        description: "Trigger on likes, retweets, or other supported metrics.",
      },
      {
        title: "Your words",
        description: "Write the plug once; Social0 posts it when conditions are met.",
      },
      {
        title: "Per-post control",
        description: "Enable only on posts where a CTA makes sense.",
      },
      {
        title: "Growth automation",
        description: "Included on Growth and higher plans.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Schedule a post",
        description: "Select eligible accounts (e.g. X).",
      },
      {
        step: 2,
        title: "Configure auto-plug",
        description: "Set metric, threshold, and plug comment.",
      },
      {
        step: 3,
        title: "Publish",
        description: "Workers watch performance and fire the reply when ready.",
      },
    ],
    faq: [
      {
        question: "Which platforms support auto-plug?",
        answer:
          "Auto-plug is focused on platforms with reliable engagement metrics — currently centered on X. Check the composer for availability.",
      },
    ],
    ctaHref: "/pricing",
    ctaLabel: "See Growth plan",
  },
  {
    slug: "calendar",
    label: "Content calendar",
    metaTitle: "Social Media Content Calendar | Social0",
    metaDescription:
      "One calendar for drafts, scheduled, queued, and published posts across every connected account.",
    keywords: ["content calendar", "social media calendar", "schedule calendar"],
    heroHeadline: "One calendar for every platform you post to",
    heroSubheadline:
      "See scheduled, queued, and published work in month and week views — not nine separate apps.",
    intro:
      "The Social0 calendar is the control surface for your content pipeline. Jump into a post to edit, reschedule, or inspect per-platform results.",
    benefits: [
      {
        title: "Cross-platform view",
        description: "All connected accounts in one place.",
      },
      {
        title: "Week & month",
        description: "Zoom out for planning or in for the next few days.",
      },
      {
        title: "Click through to edit",
        description: "Open drafts and scheduled posts without hunting lists.",
      },
      {
        title: "Timezone aware",
        description: "Times follow your settings timezone.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect accounts",
        description: "OAuth your networks from Connections.",
      },
      {
        step: 2,
        title: "Schedule content",
        description: "Composer or create forms put posts on the calendar.",
      },
      {
        step: 3,
        title: "Manage from Calendar",
        description: "Reschedule or inspect anything on the grid.",
      },
    ],
    faq: [
      {
        question: "Does the calendar include drafts?",
        answer: "Yes — drafts, scheduled, queued, and published posts are visible.",
      },
    ],
    ctaHref: "/dashboard/calendar",
    ctaLabel: "Open calendar",
    docsHref: "https://docs.social0.app/docs/dashboard/calendar",
  },
  {
    slug: "queue",
    label: "Posting queue",
    metaTitle: "Social Media Posting Queue | Social0",
    metaDescription:
      "Recurring weekly time slots. Drop posts into the next queue slot instead of picking times every time.",
    keywords: ["posting queue", "social media queue", "content queue"],
    heroHeadline: "Fill recurring slots instead of picking every timestamp",
    heroSubheadline:
      "Define weekly queue times in Settings, then assign posts to the next open slot.",
    intro:
      "Queues are for creators with a rhythm — mornings on LinkedIn, evenings on X. Configure slots once and keep shipping.",
    benefits: [
      {
        title: "Weekly slots",
        description: "Recurring times in your timezone.",
      },
      {
        title: "Next slot action",
        description: "One click from the composer sidebar.",
      },
      {
        title: "Less decision fatigue",
        description: "Stop negotiating with yourself about ‘when’.",
      },
      {
        title: "Still editable",
        description: "Override any queued time before it publishes.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Set slots",
        description: "Settings → Queue — add weekly times.",
      },
      {
        step: 2,
        title: "Compose",
        description: "Choose Next queue slot when scheduling.",
      },
      {
        step: 3,
        title: "Publish on rhythm",
        description: "Workers pick up scheduled queue times like any other post.",
      },
    ],
    faq: [
      {
        question: "Can I mix queue and manual times?",
        answer: "Yes. Queue is optional — pick an exact datetime whenever you want.",
      },
    ],
    ctaHref: "/dashboard/settings",
    ctaLabel: "Configure queue",
    docsHref: "https://docs.social0.app/docs/dashboard/queue",
  },
  {
    slug: "teams",
    label: "Teams",
    metaTitle: "Teams & Workspaces for Social Scheduling | Social0",
    metaDescription:
      "Invite teammates, share workspaces, and collaborate on social publishing with Social0 teams.",
    keywords: ["social media teams", "collaborative scheduling", "social0 workspaces"],
    heroHeadline: "Invite your team without sharing one login",
    heroSubheadline:
      "Workspaces and roles so founders, editors, and agencies can ship together.",
    intro:
      "Teams let you collaborate on Social0 without handing over a personal account. Invite members, assign access, and keep publishing under the right workspace.",
    benefits: [
      {
        title: "Invites & roles",
        description: "Bring people in with the right permissions.",
      },
      {
        title: "Workspaces",
        description: "Separate client or brand contexts when you need them.",
      },
      {
        title: "Shared pipeline",
        description: "Drafts, calendar, and connections in one collaborative surface.",
      },
      {
        title: "Plan-aware",
        description: "Team features follow your subscription tier.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Create or open a team",
        description: "Dashboard → Teams.",
      },
      {
        step: 2,
        title: "Invite members",
        description: "Send invite links with the right role.",
      },
      {
        step: 3,
        title: "Publish together",
        description: "Compose and schedule from the shared workspace.",
      },
    ],
    faq: [
      {
        question: "Do teammates need their own Social0 login?",
        answer: "Yes — each person signs in, then joins via invite.",
      },
    ],
    ctaHref: "/dashboard/teams",
    ctaLabel: "Open teams",
    docsHref: "https://docs.social0.app/docs/dashboard/teams",
  },
  {
    slug: "chatgpt",
    label: "ChatGPT MCP",
    metaTitle: "Publish with ChatGPT via MCP | Social0",
    metaDescription:
      "Connect Social0 MCP to ChatGPT and draft, schedule, or publish across platforms from chat.",
    keywords: ["chatgpt mcp", "chatgpt social media", "mcp social publishing"],
    heroHeadline: "Let ChatGPT publish through Social0 MCP",
    heroSubheadline:
      "Connect mcp.social0.app, authorize once, then ask ChatGPT to draft and ship.",
    intro:
      "Social0’s hosted MCP server exposes tools like create_draft, schedule_post, upload_media, and publish_now. ChatGPT can call them after you connect OAuth.",
    benefits: [
      {
        title: "Hosted MCP URL",
        description: "Point ChatGPT at https://mcp.social0.app/mcp — no local server required.",
      },
      {
        title: "OAuth connect",
        description: "Authorize Social0 once; the agent uses your connected accounts.",
      },
      {
        title: "Full publish path",
        description: "Drafts, media, schedule, and status — not just caption generation.",
      },
      {
        title: "Same 9 platforms",
        description: "Whatever you connected in the dashboard is available to the agent.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Open the MCP guide",
        description: "Visit /mcp and pick ChatGPT.",
      },
      {
        step: 2,
        title: "Add the server",
        description: "Paste the hosted MCP URL and complete OAuth.",
      },
      {
        step: 3,
        title: "Ask to publish",
        description: "Tell ChatGPT what to post and where.",
      },
    ],
    faq: [
      {
        question: "Do I still need the dashboard?",
        answer:
          "Yes for connecting OAuth accounts and billing. Day-to-day publishing can happen in chat.",
      },
    ],
    ctaHref: "/mcp",
    ctaLabel: "Set up MCP",
    docsHref: "https://docs.social0.app/docs/integrations/mcp",
  },
  {
    slug: "claude",
    label: "Claude MCP",
    metaTitle: "Publish with Claude via MCP | Social0",
    metaDescription:
      "Use Claude with Social0 MCP to draft, schedule, and publish to LinkedIn, X, TikTok, and more.",
    keywords: ["claude mcp", "claude social media", "anthropic mcp publishing"],
    heroHeadline: "Claude + Social0 MCP = publish from conversation",
    heroSubheadline:
      "Wire Social0 into Claude Desktop or Claude.ai-compatible MCP hosts and ship without tab-hopping.",
    intro:
      "Claude can call Social0 tools over MCP: list accounts, upload media, create drafts, schedule, and check publish status.",
    benefits: [
      {
        title: "Native MCP tools",
        description: "Structured tools — not brittle copy-paste of API docs.",
      },
      {
        title: "Media aware",
        description: "Upload from URL, base64, or local paths depending on host support.",
      },
      {
        title: "Multi-platform fan-out",
        description: "One request can target every connected network Social0 supports.",
      },
      {
        title: "Status polling",
        description: "Ask Claude to wait on get_publish_status until platforms finish.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Follow the Claude setup",
        description: "Instructions live on the /mcp page.",
      },
      {
        step: 2,
        title: "Authorize Social0",
        description: "Complete OAuth when the host prompts you.",
      },
      {
        step: 3,
        title: "Publish in chat",
        description: "Describe the post; Claude calls the tools.",
      },
    ],
    faq: [
      {
        question: "Does this work with Claude Code?",
        answer:
          "Claude Code often prefers CLI/skills; MCP hosts use the hosted MCP URL. See /mcp for both paths.",
      },
    ],
    ctaHref: "/mcp",
    ctaLabel: "Set up MCP",
    docsHref: "https://docs.social0.app/docs/integrations/mcp",
  },
  {
    slug: "cursor",
    label: "Cursor MCP",
    metaTitle: "Social0 MCP in Cursor | Social0",
    metaDescription:
      "Add Social0 MCP to Cursor and publish social posts from your coding agent.",
    keywords: ["cursor mcp", "cursor social media", "mcp in cursor"],
    heroHeadline: "Publish from Cursor with Social0 MCP",
    heroSubheadline:
      "Your coding agent already has context. Give it Social0 tools and ship updates without leaving the IDE.",
    intro:
      "Add the hosted Social0 MCP server in Cursor settings, authorize, and let the agent create drafts or schedule launches alongside your shipping work.",
    benefits: [
      {
        title: "IDE-native",
        description: "No separate marketing tab for routine posts.",
      },
      {
        title: "Same MCP tools",
        description: "Identical tool set as ChatGPT and Claude hosts.",
      },
      {
        title: "Great for launch notes",
        description: "Announce releases the moment the PR merges.",
      },
      {
        title: "Docs + dashboard backup",
        description: "Fall back to the UI anytime for complex media edits.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Add MCP server",
        description: "Use https://mcp.social0.app/mcp in Cursor MCP settings.",
      },
      {
        step: 2,
        title: "Authorize",
        description: "Complete Social0 OAuth.",
      },
      {
        step: 3,
        title: "Ask Cursor",
        description: "Draft and schedule from the agent chat.",
      },
    ],
    faq: [
      {
        question: "Can Cursor upload local files?",
        answer:
          "When the host allows file access, Social0 media tools can take local paths. Otherwise use a public URL.",
      },
    ],
    ctaHref: "/mcp",
    ctaLabel: "Set up MCP",
  },
  {
    slug: "openclaw",
    label: "OpenClaw skill",
    metaTitle: "Social0 OpenClaw Skill | Social0",
    metaDescription:
      "Install the Social0 OpenClaw skill and let your agent publish across platforms.",
    keywords: ["openclaw social0", "openclaw skill", "agent social publishing"],
    heroHeadline: "OpenClaw skill for Social0 publishing",
    heroSubheadline:
      "Install @abhishek-b-r/social0 and give OpenClaw a direct path to your connected accounts.",
    intro:
      "OpenClaw users can install the Social0 skill and drive drafts, schedules, and publishes through the agent runtime.",
    benefits: [
      {
        title: "One install command",
        description: "openclaw skills install @abhishek-b-r/social0",
      },
      {
        title: "Agent-first",
        description: "Built for autonomous loops, not only chat UIs.",
      },
      {
        title: "Uses your Social0 account",
        description: "Publishes through the same OAuth connections as the dashboard.",
      },
      {
        title: "Pairs with CLI",
        description: "Also available via npx skills add abhishek-b-r/social0-cli.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Install the skill",
        description: "Run the OpenClaw install command from /mcp.",
      },
      {
        step: 2,
        title: "Authenticate",
        description: "Connect Social0 / API key as the skill requires.",
      },
      {
        step: 3,
        title: "Delegate posting",
        description: "Let OpenClaw schedule or publish on your behalf.",
      },
    ],
    faq: [
      {
        question: "Is OpenClaw required?",
        answer:
          "No — MCP and CLI work elsewhere. OpenClaw is optional for users already on that runtime.",
      },
    ],
    ctaHref: "/mcp",
    ctaLabel: "See agent setup",
  },
  // ponytail: self-host page hidden while repo is private — restore block when re-opened
  /*
  {
    slug: "self-host",
    label: "Self-host",
    metaTitle: "Self-Host Social0 | Social0",
    metaDescription:
      "Run Social0 yourself. Open GitHub for the self-host repository and deploy on your infra.",
    keywords: ["self host social0", "open source social scheduler", "social0 github"],
    heroHeadline: "Self-host Social0 on your own stack",
    heroSubheadline:
      "Prefer your cloud? The self-host repo is on GitHub — clone, configure, and run.",
    intro:
      "Social0’s self-host path is for teams that want control over data and deploy targets. Start from the public repository and follow the README.",
    benefits: [
      {
        title: "Public repo",
        description: "github.com/abhishek-b-r/social0-selfhost",
      },
      {
        title: "Your keys, your DB",
        description: "Keep platform OAuth and Postgres under your account.",
      },
      {
        title: "Same product ideas",
        description: "Scheduler, connections, and developer surfaces aligned with social0.app.",
      },
      {
        title: "Community issues",
        description: "Report problems and contribute on GitHub.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Clone the repo",
        description: "Open the self-host GitHub repository.",
      },
      {
        step: 2,
        title: "Configure env",
        description: "Copy example env files and fill secrets.",
      },
      {
        step: 3,
        title: "Run the stack",
        description: "Follow README install and run instructions.",
      },
    ],
    faq: [
      {
        question: "Is cloud Social0 still available?",
        answer: "Yes — social0.app remains the hosted product. Self-host is optional.",
      },
    ],
    ctaHref: "https://github.com/abhishek-b-r/social0-selfhost",
    ctaLabel: "View on GitHub",
  },
  */
];

export const TOOL_SLUGS = TOOLS.map((t) => t.slug);

export function getTool(slug: string): ToolPage | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
