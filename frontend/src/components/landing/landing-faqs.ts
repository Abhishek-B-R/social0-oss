export const landingFaqs = [
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
      "Absolutely. No contracts, no cancellation fees. You can cancel your subscription at any time from your dashboard.",
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
    question: "Does Social0 have an API?",
    answer:
      "Yes. Social0 has a REST API at api.social0.app/v1, an MCP server at mcp.social0.app/mcp for AI apps, and an official CLI (`npm install -g social0`). Create API keys in Dashboard → Developer.",
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
