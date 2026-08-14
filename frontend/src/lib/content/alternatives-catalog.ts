import type { AlternativePage } from "./alternative-page-types";

type CompetitorAngle =
  | "enterprise"
  | "agency"
  | "creator"
  | "analytics"
  | "ai-native"
  | "budget"
  | "visual"
  | "general";

type CompetitorDef = {
  slug: string;
  name: string;
  angle: CompetitorAngle;
  /** Short phrase: what the competitor is known for (used in intro). */
  knownFor: string;
};

const SOCIAL0_PLATFORMS =
  "X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest";

const CORE_WHY = [
  "One composer for text, images, video, threads, and carousels",
  `Publish to ${SOCIAL0_PLATFORMS}`,
  "Parallel publishing - every selected account at once",
  "Per-platform captions when you need a different hook",
  "MCP, REST API, and CLI for AI agents and automation",
];

function angleHero(
  name: string,
  angle: CompetitorAngle,
): { headline: string; subheadline: string; intro: string } {
  switch (angle) {
    case "enterprise":
      return {
        headline: `A ${name} alternative without enterprise overhead`,
        subheadline: `${name} targets larger orgs. Social0 is built for fast multi-platform publishing.`,
        intro: `${name} is ${angleKnownFor(angle)}. If you mainly need reliable scheduling and publishing across many networks - not a full enterprise suite - Social0 gives you one composer, parallel publishing to nine platforms, and clear per-platform results without seat mazes or long onboarding.`,
      };
    case "agency":
      return {
        headline: `${name} alternative for agencies that publish at scale`,
        subheadline:
          "Multi-brand scheduling with MCP, API, and a publish-first dashboard.",
        intro: `${name} is ${angleKnownFor(angle)}. Social0 keeps the workflow simple: compose once, pick accounts, publish or schedule in parallel, and use API or MCP when clients want automation - without rebuilding your stack around a heavy workspace UI.`,
      };
    case "creator":
      return {
        headline: `The ${name} alternative for creators on every platform`,
        subheadline:
          "Go beyond one network - schedule everywhere from one composer.",
        intro: `${name} is ${angleKnownFor(angle)}. When your audience lives on Threads, Bluesky, LinkedIn, and TikTok - not just one feed - Social0 lets you write once, tailor captions per platform, and publish in parallel instead of re-uploading everywhere.`,
      };
    case "analytics":
      return {
        headline: `${name} alternative focused on publishing, not dashboards`,
        subheadline:
          "Schedule and ship content across nine platforms without analytics lock-in.",
        intro: `${name} is ${angleKnownFor(angle)}. Social0 is publish-first: calendar, drafts, scheduling, and multi-platform posting - plus MCP and API for agents - without paying for reporting you may already get elsewhere.`,
      };
    case "ai-native":
      return {
        headline: `${name} alternative with MCP, API, and CLI built in`,
        subheadline:
          "AI-native scheduling - same publish pipeline for humans and agents.",
        intro: `${name} is ${angleKnownFor(angle)}. Social0 ships a hosted MCP server, REST API, webhooks, and npm CLI on every plan tier - so ChatGPT, Claude, Cursor, or your own agents publish through the same OAuth-connected accounts as your dashboard.`,
      };
    case "budget":
      return {
        headline: `Affordable ${name} alternative for multi-platform posting`,
        subheadline:
          "Start free. Upgrade when you need bulk tools, teams, or higher limits.",
        intro: `${name} is ${angleKnownFor(angle)}. Social0 offers a free tier, simple paid plans, and one workflow for nine platforms - compose once, publish everywhere, with parallel delivery and per-platform success feedback.`,
      };
    case "visual":
      return {
        headline: `${name} alternative with a faster publish workflow`,
        subheadline:
          "Plan visually if you want - ship from one composer either way.",
        intro: `${name} is ${angleKnownFor(angle)}. Social0 adds parallel multi-platform publishing, per-platform captions, calendar scheduling, and agent automation via MCP - so approval and planning do not slow down getting content live.`,
      };
    default:
      return {
        headline: `The ${name} alternative for multi-platform scheduling`,
        subheadline:
          "Compose once and publish to nine platforms from one dashboard.",
        intro: `${name} is ${angleKnownFor(angle)}. Social0 focuses on the publish path: one composer, parallel publishing, drafts, calendar, and scheduling - with MCP, API, and CLI when you want AI or custom automation.`,
      };
  }
}

function angleKnownFor(angle: CompetitorAngle): string {
  const map: Record<CompetitorAngle, string> = {
    enterprise: "built for large teams, analytics, and enterprise workflows",
    agency: "popular with agencies managing many client accounts",
    creator: "strong for creators and visual-first social planning",
    analytics: "known for analytics, reporting, and performance dashboards",
    "ai-native": "positioned for AI-assisted and developer-driven publishing",
    budget: "a budget-friendly option for scheduling and basic management",
    visual: "focused on visual planning, approvals, and collaboration",
    general: "a well-known social media management tool",
  };
  return map[angle];
}

function comparisonFor(angle: CompetitorAngle) {
  const base = [
    {
      feature: "Primary focus",
      social0: "Scheduling & publishing",
      competitor:
        angle === "enterprise"
          ? "Enterprise suite"
          : angle === "analytics"
            ? "Analytics & reporting"
            : angle === "ai-native"
              ? "AI / automation angle"
              : "Varies by plan",
    },
    {
      feature: "Platforms",
      social0: "9 including Bluesky & Threads",
      competitor: "Varies; check your channels",
    },
    {
      feature: "Parallel publishing",
      social0: "All selected accounts at once",
      competitor: "Often sequential or per-queue",
    },
    {
      feature: "MCP / API / CLI",
      social0: "Included (MCP, REST, CLI)",
      competitor: angle === "ai-native" ? "Varies" : "Limited or add-on",
    },
    {
      feature: "Onboarding",
      social0: "Minutes to first post",
      competitor: angle === "enterprise" ? "Longer setup" : "Moderate",
    },
  ];
  if (angle === "enterprise" || angle === "analytics") {
    base.push({
      feature: "Social listening",
      social0: "Not included",
      competitor: "Often included",
    });
  }
  return base;
}

function faqFor(name: string) {
  return [
    {
      question: `Is Social0 a good ${name} alternative?`,
      answer: `If you need reliable multi-platform scheduling with one composer, parallel publishing, and optional MCP/API automation, Social0 is a strong ${name} alternative - especially when ${name}'s pricing or workflow does not match how you actually post.`,
    },
    {
      question: `Can I migrate from ${name} to Social0?`,
      answer: `Export or copy your content from ${name}, connect accounts in Social0, and recreate drafts or scheduled posts. There is no automatic importer yet - most users are scheduling again within minutes.`,
    },
    {
      question: `Does Social0 support the same platforms as ${name}?`,
      answer: `Social0 supports ${SOCIAL0_PLATFORMS}. Compare your current ${name} channels against that list before switching.`,
    },
  ];
}

export function buildAlternativePage(def: CompetitorDef): AlternativePage {
  const { slug, name, angle, knownFor } = def;
  const hero = angleHero(name, angle);
  const year = new Date().getFullYear();

  return {
    slug,
    competitorName: name,
    metaTitle: `${name} Alternative - Social0 | Multi-Platform Scheduler ${year}`,
    metaDescription: `Looking for a ${name} alternative? Social0 lets you compose once and publish to ${SOCIAL0_PLATFORMS} - with MCP, API, and CLI for AI agents. Start free.`,
    keywords: [
      `${name.toLowerCase()} alternative`,
      `${name.toLowerCase()} vs social0`,
      "social media scheduler",
      `${name.toLowerCase()} replacement`,
    ],
    heroHeadline: hero.headline,
    heroSubheadline: hero.subheadline,
    intro: hero.intro.replace(angleKnownFor(angle), knownFor),
    whySwitch: CORE_WHY,
    comparisonRows: comparisonFor(angle),
    faq: faqFor(name),
    relatedFeatureSlugs: [
      "multi-platform-scheduler",
      "social-media-calendar",
      "threads-scheduler",
    ],
  };
}

/** Competitors sourced from PostPlanify / PostSyncer / Postiz sitemap patterns. */
export const COMPETITOR_CATALOG: CompetitorDef[] = [
  {
    slug: "agorapulse",
    name: "Agorapulse",
    angle: "enterprise",
    knownFor: "built for inbox, reporting, and team workflows at scale",
  },
  {
    slug: "coschedule",
    name: "CoSchedule",
    angle: "visual",
    knownFor: "built around marketing calendars and content organization",
  },
  {
    slug: "eclincher",
    name: "eClincher",
    angle: "agency",
    knownFor: "aimed at agencies with unified social and reputation tools",
  },
  {
    slug: "heyorca",
    name: "HeyOrca",
    angle: "agency",
    knownFor: "built for agency client approvals and content calendars",
  },
  {
    slug: "hopper-hq",
    name: "Hopper HQ",
    angle: "creator",
    knownFor: "focused on Instagram and multi-network creator scheduling",
  },
  {
    slug: "iconosquare",
    name: "Iconosquare",
    angle: "analytics",
    knownFor: "known for Instagram and social analytics dashboards",
  },
  {
    slug: "kontentino",
    name: "Kontentino",
    angle: "visual",
    knownFor: "built for approval workflows and client collaboration",
  },
  {
    slug: "loomly",
    name: "Loomly",
    angle: "agency",
    knownFor: "popular with teams for post ideas and approval flows",
  },
  {
    slug: "meetedgar",
    name: "MeetEdgar",
    angle: "creator",
    knownFor: "known for evergreen content recycling and queues",
  },
  {
    slug: "napoleoncat",
    name: "NapoleonCat",
    angle: "analytics",
    knownFor: "combines publishing with moderation and analytics",
  },
  {
    slug: "pallyy",
    name: "Pallyy",
    angle: "creator",
    knownFor: "aimed at creators with visual planning and scheduling",
  },
  {
    slug: "planable",
    name: "Planable",
    angle: "visual",
    knownFor: "built for visual feed planning and team approvals",
  },
  {
    slug: "planoly",
    name: "Planoly",
    angle: "creator",
    knownFor: "originally Instagram-first with visual grid planning",
  },
  {
    slug: "postbridge",
    name: "Post Bridge",
    angle: "ai-native",
    knownFor: "a newer AI-forward scheduler in the same category as Social0",
  },
  {
    slug: "postiz",
    name: "Postiz",
    angle: "ai-native",
    knownFor: "open-source and AI-agent friendly social scheduling",
  },
  {
    slug: "post-planner",
    name: "Post Planner",
    angle: "budget",
    knownFor: "focused on content suggestions and affordable scheduling",
  },
  {
    slug: "recurpost",
    name: "RecurPost",
    angle: "budget",
    knownFor: "known for recurring posts and budget-friendly plans",
  },
  {
    slug: "sendible",
    name: "Sendible",
    angle: "agency",
    knownFor: "built for agencies with client dashboards and reporting",
  },
  {
    slug: "sked-social",
    name: "Sked Social",
    angle: "creator",
    knownFor: "Instagram-first scheduling with visual planning",
  },
  {
    slug: "socialbee",
    name: "SocialBee",
    angle: "budget",
    knownFor: "known for content categories and affordable scheduling",
  },
  {
    slug: "socialpilot",
    name: "SocialPilot",
    angle: "agency",
    knownFor: "popular with agencies and small teams at scale",
  },
  {
    slug: "sprinklr",
    name: "Sprinklr",
    angle: "enterprise",
    knownFor: "an enterprise unified customer experience platform",
  },
  {
    slug: "statusbrew",
    name: "Statusbrew",
    angle: "agency",
    knownFor: "built for teams with inbox and publishing workflows",
  },
  {
    slug: "tailwind",
    name: "Tailwind",
    angle: "creator",
    knownFor: "best known for Pinterest and Instagram scheduling",
  },
  {
    slug: "vista-social",
    name: "Vista Social",
    angle: "agency",
    knownFor: "aimed at agencies with inbox and review management",
  },
  {
    slug: "zoho-social",
    name: "Zoho Social",
    angle: "general",
    knownFor: "part of the Zoho suite for business social management",
  },
  {
    slug: "ayrshare",
    name: "Ayrshare",
    angle: "ai-native",
    knownFor: "an API-first social posting service for developers and apps",
  },
  {
    slug: "bardeen",
    name: "Bardeen",
    angle: "ai-native",
    knownFor:
      "a browser automation platform that can connect to social workflows",
  },
  {
    slug: "blotato",
    name: "Blotato",
    angle: "ai-native",
    knownFor: "an AI-native tool for creating and scheduling social content",
  },
  {
    slug: "brandwatch",
    name: "Brandwatch",
    angle: "enterprise",
    knownFor:
      "an enterprise social listening and consumer intelligence platform",
  },
  {
    slug: "contentstudio",
    name: "ContentStudio",
    angle: "agency",
    knownFor:
      "built for content discovery, planning, and multi-channel publishing",
  },
  {
    slug: "creasquare",
    name: "Creasquare",
    angle: "creator",
    knownFor: "focused on AI-assisted video and social content creation",
  },
  {
    slug: "dlvr-it",
    name: "dlvr.it",
    angle: "budget",
    knownFor: "a long-running auto-posting and feed-to-social automation tool",
  },
  {
    slug: "fedica",
    name: "Fedica",
    angle: "analytics",
    knownFor: "known for X (Twitter) analytics, scheduling, and audience tools",
  },
  {
    slug: "feedhive",
    name: "FeedHive",
    angle: "ai-native",
    knownFor:
      "uses AI for post generation, scheduling, and performance insights",
  },
  {
    slug: "followr",
    name: "Followr",
    angle: "ai-native",
    knownFor: "an AI-assisted social media management and scheduling tool",
  },
  {
    slug: "hookle",
    name: "Hookle",
    angle: "creator",
    knownFor: "a mobile-first social marketing app for small businesses",
  },
  {
    slug: "missinglettr",
    name: "Missinglettr",
    angle: "creator",
    knownFor:
      "built for automated drip campaigns and blog-to-social repurposing",
  },
  {
    slug: "mixpost",
    name: "Mixpost",
    angle: "ai-native",
    knownFor: "a self-hosted, open-source social scheduling alternative",
  },
  {
    slug: "nuelink",
    name: "Nuelink",
    angle: "budget",
    knownFor: "affordable scheduling with automation and link-in-bio features",
  },
  {
    slug: "oktopost",
    name: "Oktopost",
    angle: "enterprise",
    knownFor: "a B2B social media management platform for employee advocacy",
  },
  {
    slug: "oneup",
    name: "OneUp",
    angle: "budget",
    knownFor: "a mobile-friendly scheduler popular with solo creators and SMBs",
  },
  {
    slug: "planly",
    name: "Planly",
    angle: "visual",
    knownFor: "a visual social media planner with approval workflows",
  },
  {
    slug: "postcron",
    name: "Postcron",
    angle: "budget",
    knownFor: "a simple bulk scheduling tool for multiple social accounts",
  },
  {
    slug: "postflow",
    name: "PostFlow",
    angle: "ai-native",
    knownFor: "an AI workflow tool for generating and scheduling social posts",
  },
  {
    slug: "postsyncer",
    name: "PostSyncer",
    angle: "ai-native",
    knownFor: "a multi-platform scheduler with AI and automation features",
  },
  {
    slug: "promorepublic",
    name: "PromoRepublic",
    angle: "agency",
    knownFor:
      "built for franchises and local marketing teams with content libraries",
  },
  {
    slug: "radaar",
    name: "Radaar",
    angle: "agency",
    knownFor: "a social media management platform for agencies and brands",
  },
  {
    slug: "semrush",
    name: "Semrush",
    angle: "analytics",
    knownFor:
      "a marketing suite that includes social posting and analytics tools",
  },
  {
    slug: "social-champ",
    name: "Social Champ",
    angle: "budget",
    knownFor: "affordable scheduling with recycling and bulk upload features",
  },
  {
    slug: "sociality",
    name: "Sociality.io",
    angle: "agency",
    knownFor: "aimed at agencies with publishing, analytics, and listening",
  },
  {
    slug: "socialkiwi",
    name: "SocialKiwi",
    angle: "budget",
    knownFor: "a lightweight social media scheduling and management tool",
  },
  {
    slug: "socialpika",
    name: "SocialPika",
    angle: "budget",
    knownFor: "a budget scheduler for small teams and solopreneurs",
  },
  {
    slug: "storefries",
    name: "Storefries",
    angle: "general",
    knownFor: "a social commerce and scheduling tool for online sellers",
  },
  {
    slug: "taplio",
    name: "Taplio",
    angle: "creator",
    knownFor: "a LinkedIn-focused content creation and scheduling tool",
  },
  {
    slug: "the-social-poster",
    name: "The Social Poster",
    angle: "general",
    knownFor: "a straightforward multi-platform social posting tool",
  },
  {
    slug: "tweet-hunter",
    name: "Tweet Hunter",
    angle: "creator",
    knownFor: "built for X (Twitter) growth, threads, and scheduling",
  },
  {
    slug: "typefully",
    name: "Typefully",
    angle: "creator",
    knownFor: "focused on X (Twitter) and LinkedIn threads and scheduling",
  },
  {
    slug: "unboxsocial",
    name: "Unbox Social",
    angle: "analytics",
    knownFor: "combines scheduling with social media analytics and reporting",
  },
  {
    slug: "upload-post",
    name: "Upload-Post",
    angle: "ai-native",
    knownFor: "an API and automation tool for programmatic social posting",
  },
];

export const CATALOG_ALTERNATIVES: AlternativePage[] =
  COMPETITOR_CATALOG.map(buildAlternativePage);
