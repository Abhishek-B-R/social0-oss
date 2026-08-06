export type LandingFaq = {
  question: string;
  answer: string;
  /** Prefer in Agents mode — still shown in Schedule mode further down */
  agent?: boolean;
};

/** High-priority FAQs that reduce purchase friction. */
export const landingFaqs: LandingFaq[] = [
  {
    question: "Does Social0 work with AI agents?",
    answer:
      "Yes. Connect via the MCP server at mcp.social0.app/mcp (ChatGPT, Claude, OpenClaw, and other MCP clients), use the REST API at api.social0.app/v1, or the official CLI (`npm install -g social0`). Agents draft, schedule, and publish through the same pipeline as the dashboard.",
    agent: true,
  },
  {
    question: "How do I connect ChatGPT or Claude via MCP?",
    answer:
      "Add Social0 as a remote MCP server (mcp.social0.app/mcp) with an API key from Dashboard → Developer. Once connected, ask your agent to draft, schedule, or publish — posts show up in Social0 like any other.",
    agent: true,
  },
  {
    question: "Does Social0 have an API and CLI?",
    answer:
      "Yes. REST API at api.social0.app/v1 (works great from Postman), MCP at mcp.social0.app/mcp, and `npm install -g social0` for the CLI. Create API keys in Dashboard → Developer.",
    agent: true,
  },
  {
    question: "Why switch from Buffer or Hootsuite?",
    answer:
      "Same job — post everywhere — without the enterprise bloat or $75–$200/month price tag. Social0 focuses on what you actually use: connect accounts, write once, publish or schedule across all your platforms fast. You also get REST API, MCP, and CLI on every plan (including Free), plus human support from Abhishek (the founder) instead of a ticket queue.",
  },
  {
    question: "What platforms does Social0 support?",
    answer:
      "Nine platforms today: Twitter/X, Instagram, LinkedIn, YouTube, TikTok, Facebook, Threads, Bluesky, and Pinterest — for instant publish and scheduling. See the Platforms section on this page for the full list. Want another network? Email support@social0.app.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "Yes. Free includes 3 connected accounts and 10 posts. No credit card required.",
  },
  {
    question: "How many social accounts can I connect?",
    answer:
      "Depends on your plan: Free 3, Starter 5, Growth 15, Pro 50. See Pricing for the full breakdown — you won't find a clearer price for what you get.",
  },
  {
    question: "What types of content can I post?",
    answer:
      "Text, images, videos, carousels (multi-image), and platform-native formats where supported — so you can share the same content types you already post manually.",
  },
  {
    question: "Can I manage multiple brands or workspaces?",
    answer:
      "Yes on Starter and above. Create workspaces for separate brands or clients, connect accounts per workspace, and switch between them from the dashboard.",
  },
  {
    question: "Will my posts get less reach using Social0?",
    answer:
      "No. Posts go out through each platform's official APIs — the same channels legitimate schedulers use — so reach matches posting from the native app. Algorithms change, but we don't throttle or shadow your content.",
  },
  {
    question: "What happens if a platform fails to publish?",
    answer:
      "If one platform fails (for example due to an API error or rate limit), the other platforms will still publish normally. You'll see exactly which platforms succeeded and which failed.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. All OAuth tokens are encrypted with AES-256-GCM at rest. We never store your social media passwords. Your data is hosted on secure infrastructure with regular security audits.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. No contracts and no cancellation fees. Cancel anytime from Billing; you keep access until the end of the current billing period.",
  },
  {
    question: "I have another question",
    answer:
      "Cool — email support@social0.app and we'll get back to you.",
  },
];

/** Schedule: keep list order. Agents: agent FAQs first. */
export function faqsForMode(mode: "normal" | "agent"): LandingFaq[] {
  if (mode !== "agent") return landingFaqs;
  const agent = landingFaqs.filter((f) => f.agent);
  const general = landingFaqs.filter((f) => !f.agent);
  return [...agent, ...general];
}
