export type LandingFaq = {
  question: string;
  answer: string;
  /** Prefer in Agents mode — still shown in Schedule mode further down */
  agent?: boolean;
};

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
    question: "What platforms does Social0 support?",
    answer:
      "Social0 supports 9 platforms: Twitter/X, Instagram, LinkedIn, YouTube, TikTok, Facebook, Threads, Bluesky, and Pinterest. We're actively adding more.",
  },
  {
    question: "Is there a free trial?",
    answer: "Yes! All plans include a 3-day free trial. Cancel anytime.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. No contracts and no cancellation fees. Cancel anytime from Billing; you keep access until the end of the current billing period. Subscription fees are non-refundable except where required by law — see our Refund & Cancellation Policy.",
  },
  {
    question: "Do I need to give Social0 my social media passwords?",
    answer:
      "No. Social0 connects using official OAuth integrations from each platform. You sign in directly with the platform and grant permission - we never see or store your passwords.",
  },
  {
    question: "Can I connect multiple accounts per platform?",
    answer:
      "Yes. You can connect multiple accounts from the same platform and choose which ones to publish to for each post.",
  },
  {
    question: "How does parallel publishing work?",
    answer:
      "When you hit publish, Social0 sends your post to all selected platforms simultaneously. If one platform fails (API error, rate limit), the others still go through. You'll see exactly which succeeded and which failed.",
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
    question: "Who built Social0?",
    answer:
      "Social0 is built by Abhishek (@abhitwt on X), an independent developer who posts online and wanted a faster way to publish across multiple platforms. The product is being continuously improved based on user feedback.",
  },
];

/** Schedule: general FAQs first, agent ones later. Agents: agent FAQs first. */
export function faqsForMode(mode: "normal" | "agent"): LandingFaq[] {
  if (mode === "agent") {
    const agent = landingFaqs.filter((f) => f.agent);
    const rest = landingFaqs.filter((f) => !f.agent);
    return [...agent, ...rest];
  }
  const general = landingFaqs.filter((f) => !f.agent);
  const agent = landingFaqs.filter((f) => f.agent);
  return [...general, ...agent];
}
