import type { BlogPost } from "../blog-types";

export const postToSocialMediaFromClaudeCode: BlogPost = {
  slug: "post-to-social-media-from-claude-code",
  category: "AI & automation",
  metaTitle: "Post to Social Media from Claude Code (CLI or MCP Setup)",
  metaDescription:
    "Let Claude Code write and schedule your launch posts, release threads and changelog updates to X, LinkedIn, Threads and Bluesky, from the terminal you already ship from.",
  keywords: [
    "claude code social media",
    "post to social media from claude code",
    "claude code mcp social media",
    "claude code post to twitter",
    "claude code linkedin post",
    "ai agent post to social media",
    "social media cli",
  ],
  title: "Post to social media from Claude Code",
  excerpt:
    "You already ship from Claude Code. It can also write the launch post, turn the changelog into a thread, and schedule both to X, LinkedIn, Threads and Bluesky, without leaving the terminal. Here is the setup, two ways, and the prompts that work.",
  datePublished: "2026-11-26",
  readingMinutes: 7,
  body: [
    {
      type: "paragraph",
      text: "**Short answer:** install the `social0` CLI, log in with an API key, and tell Claude Code it can use it. Claude Code has a shell, so a CLI is the simplest tool for it: it runs `social0 schedule …` like any other command. If you prefer MCP, add Social0's hosted MCP server with one `claude mcp add` command instead.",
    },
    {
      type: "paragraph",
      text: "This is the developer version of [posting from ChatGPT or Claude](/blog/post-to-social-media-with-ai-agents). The difference is context: Claude Code can read your git log, diff and changelog, so it writes posts about what you actually shipped.",
    },
    {
      type: "heading",
      text: "Option A: the CLI (recommended)",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Connect your accounts in Social0 under **Connections** (OAuth stays in the dashboard).",
        "Create an API key under **Developer → API keys**.",
        "Install and log in:",
      ],
    },
    {
      type: "code",
      language: "bash",
      code: "npm install -g social0\nsocial0 login        # paste sk_live_… (input is masked)\nsocial0 accounts     # lists your connected accounts with short IDs",
    },
    {
      type: "paragraph",
      text: "That's all the setup. Claude Code can now run commands like these when you ask it to:",
    },
    {
      type: "code",
      language: "bash",
      code: "social0 publish -c \"v2.3 is out: faster exports and dark mode\" -p twitter linkedin\nsocial0 schedule -c \"Launch day tomorrow\" -p twitter threads bluesky -t \"tomorrow 9am\"\nsocial0 upload ./screenshot.png --json   # returns a media ID to attach with -m",
    },
    {
      type: "paragraph",
      text: "Times like `tomorrow 9am`, `next monday` or `in 2 hours` use your local time. The [CLI page](/tools/cli) has every command.",
    },
    {
      type: "subheading",
      text: "Tell Claude Code how you post",
    },
    {
      type: "paragraph",
      text: "Add a few lines to your project's `CLAUDE.md` so every session knows the rules without you repeating them:",
    },
    {
      type: "code",
      language: "markdown",
      code: "## Social posts\n- Use the `social0` CLI to post. Run `social0 accounts` first.\n- Never publish without showing me the exact text first.\n- Default: schedule with `-t`, don't publish immediately.\n- X max 280 chars; LinkedIn can be longer; no hashtags on X.",
    },
    {
      type: "heading",
      text: "Option B: MCP",
    },
    {
      type: "paragraph",
      text: "If you'd rather Claude Code use structured tools than shell commands, add Social0's hosted MCP server:",
    },
    {
      type: "code",
      language: "bash",
      code: "claude mcp add --transport http social0 https://mcp.social0.app/mcp",
    },
    {
      type: "paragraph",
      text: "Then run `/mcp` inside Claude Code and sign in to Social0 when the browser opens. No API key goes in a config file; the sign-in creates a key you can revoke in the dashboard. Ask \"show my connected Social0 accounts\" to check it works.",
    },
    {
      type: "table",
      caption: "CLI or MCP in Claude Code?",
      columns: ["", "CLI", "MCP"],
      rows: [
        ["Setup", "npm install + API key", "One claude mcp add + browser sign-in"],
        ["Local files (screenshots, videos)", "Upload straight from disk", "Pass a public URL or base64 data"],
        ["Also works in CI and scripts", "Yes, same commands", "No"],
        ["Best for", "Developers who live in the terminal", "Structured tools, no global install"],
      ],
    },
    {
      type: "heading",
      text: "Prompts that work",
    },
    {
      type: "list",
      items: [
        "\"Read the commits since the last tag and write a 4-post X thread about what changed for users. Show me, then schedule it for tomorrow 9am.\"",
        "\"Turn CHANGELOG.md's newest entry into a LinkedIn post and a short X post. Schedule LinkedIn for Tuesday 10am and X for Tuesday 4pm.\"",
        "\"Upload docs/settings.png and draft a post announcing the new settings page on Threads and Bluesky. Show me before scheduling.\"",
        "\"How did my X and Bluesky posts do over the last 28 days?\" (runs `social0 analytics --range 28d`; live analytics cover X, Bluesky, YouTube, TikTok and Pinterest today)",
      ],
    },
    {
      type: "callout",
      title: "Keep a human in the loop",
      text: "Posting is public and hard to take back. Have Claude Code **show the exact text and the target accounts before it runs the command**, and default to scheduling, so you have time to cancel. The CLAUDE.md snippet above makes that the rule for every session.",
    },
    {
      type: "heading",
      text: "From Claude Code to CI",
    },
    {
      type: "paragraph",
      text: "Once a prompt works well, you can make it automatic. The CLI reads `SOCIAL0_API_KEY` from the environment, so the same `social0 publish` command runs in a GitHub Action on every release. [Social media automation for developers](/blog/social-media-automation-for-developers) covers release pipelines and webhooks, and the [n8n guide](/blog/n8n-social-media-automation) covers no-code workflows.",
    },
    {
      type: "cta",
      text: "Install the CLI and let Claude Code post your launches. Free plan includes the CLI, API and MCP.",
      href: "/tools/claude",
      label: "Use Social0 with Claude",
    },
  ],
  faq: [
    {
      question: "Can Claude Code post to social media?",
      answer:
        "Yes. Give it a tool to call: a CLI such as social0, which it runs in its shell, or an MCP server added with claude mcp add. It can then publish or schedule posts to the accounts you connected.",
    },
    {
      question: "Should I use the CLI or MCP with Claude Code?",
      answer:
        "Claude Code has a shell, so the CLI is the simplest option and handles local files directly. MCP is a good fit if you want structured tools without installing a global npm package.",
    },
    {
      question: "Which networks can Claude Code post to through Social0?",
      answer:
        "X, LinkedIn, Instagram, TikTok, YouTube, Threads, Bluesky, Facebook and Pinterest, as long as the account is connected in Social0.",
    },
    {
      question: "Is it safe to give Claude Code access to my social accounts?",
      answer:
        "It never sees your social passwords: accounts are connected in the Social0 dashboard, and Claude Code only gets an API key you can revoke at any time. Add a CLAUDE.md rule that it must show you the post before publishing.",
    },
    {
      question: "Can Claude Code schedule posts for later?",
      answer:
        "Yes. With the CLI, use social0 schedule with -t and a time such as \"tomorrow 9am\". Through MCP, ask it to schedule for a date and time.",
    },
  ],
  relatedPaths: [
    { href: "/tools/cli", label: "Social0 CLI" },
    { href: "/tools/claude", label: "Social0 for Claude" },
    { href: "/mcp", label: "Social0 MCP server" },
  ],
  relatedSlugs: [
    "post-to-social-media-with-ai-agents",
    "social-media-automation-for-developers",
    "n8n-social-media-automation",
  ],
};
