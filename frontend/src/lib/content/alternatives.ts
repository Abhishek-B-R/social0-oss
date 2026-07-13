export type ComparisonRow = {
  feature: string;
  social0: string;
  competitor: string;
};

export type AlternativePage = {
  slug: string;
  competitorName: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  heroHeadline: string;
  heroSubheadline: string;
  intro: string;
  whySwitch: string[];
  comparisonRows: ComparisonRow[];
  faq: { question: string; answer: string }[];
  relatedFeatureSlugs: string[];
};

export const ALTERNATIVES: AlternativePage[] = [
  {
    slug: "buffer",
    competitorName: "Buffer",
    metaTitle: "Buffer Alternative - Social0 | Multi-Platform Scheduler",
    metaDescription:
      "Looking for a Buffer alternative? Social0 lets you compose once and publish to X, LinkedIn, Instagram, TikTok, YouTube, Threads, Bluesky, and more from one dashboard.",
    keywords: [
      "buffer alternative",
      "buffer vs social0",
      "social media scheduler",
      "buffer replacement",
    ],
    heroHeadline: "The Buffer alternative built for multi-platform publishing",
    heroSubheadline:
      "Compose once, publish everywhere — without juggling separate queues per network.",
    intro:
      "Buffer is solid for queue-based scheduling. If you post across many networks, you often end up rewriting captions, hopping between channels, and losing track of what actually went live. Social0 is built around one composer, parallel publishing to nine platforms, and clear per-platform results.",
    whySwitch: [
      "One composer for text, images, video, threads, and carousels",
      "Publish to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest",
      "Parallel publishing — every selected account at once",
      "Per-platform captions when you need a different hook",
      "Calendar, drafts, and scheduled posts in the same workflow",
    ],
    comparisonRows: [
      {
        feature: "Compose once, publish everywhere",
        social0: "Single composer",
        competitor: "Mostly per-channel queues",
      },
      {
        feature: "Platforms",
        social0: "9 including Bluesky & Threads",
        competitor: "Strong core set; varies by plan",
      },
      {
        feature: "Parallel publishing",
        social0: "All selected accounts at once",
        competitor: "Sequential / per-queue",
      },
      {
        feature: "Per-platform captions",
        social0: "Yes",
        competitor: "Limited",
      },
      {
        feature: "Publish feedback",
        social0: "Clear success / fail per platform",
        competitor: "Varies by channel",
      },
    ],
    faq: [
      {
        question: "Is Social0 a good Buffer alternative?",
        answer:
          "If you post to more than one or two platforms and want one workflow instead of separate queues, yes. Write once, pick accounts, and publish or schedule in a single step.",
      },
      {
        question: "Can I migrate scheduled posts from Buffer?",
        answer:
          "Export your content from Buffer and recreate posts in Social0. There is no automatic importer yet — drafts and scheduling are quick once your accounts are connected.",
      },
      {
        question: "Does Social0 support the same platforms as Buffer?",
        answer:
          "Social0 supports X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest. Check your current Buffer channels against that list before switching.",
      },
    ],
    relatedFeatureSlugs: [
      "multi-platform-scheduler",
      "social-media-calendar",
      "threads-scheduler",
    ],
  },
  {
    slug: "hootsuite",
    competitorName: "Hootsuite",
    metaTitle: "Hootsuite Alternative - Social0 | Simpler Social Scheduling",
    metaDescription:
      "Hootsuite alternative for creators and small teams. Social0 offers focused scheduling and publishing without enterprise complexity.",
    keywords: [
      "hootsuite alternative",
      "hootsuite vs social0",
      "social media management tool",
    ],
    heroHeadline: "A Hootsuite alternative without the enterprise overhead",
    heroSubheadline:
      "Schedule and publish across major platforms from one clean dashboard — built for speed, not boardrooms.",
    intro:
      "Hootsuite pioneered social management for agencies and enterprises. If you want a lighter tool that still handles multi-platform publishing, scheduling, and multiple accounts, Social0 focuses on the daily workflow: connect, compose, schedule or post.",
    whySwitch: [
      "Connect accounts and post in minutes",
      "Unified composer instead of stream-heavy tabs",
      "Scheduling calendar and drafts built in",
      "OAuth-only connections — we never store passwords",
      "Clear per-platform publish results",
    ],
    comparisonRows: [
      {
        feature: "Best for",
        social0: "Creators & lean teams",
        competitor: "Agencies & enterprise",
      },
      {
        feature: "Setup complexity",
        social0: "Simple",
        competitor: "Heavier onboarding",
      },
      {
        feature: "Multi-platform composer",
        social0: "Native",
        competitor: "Available",
      },
      {
        feature: "Time to first post",
        social0: "Minutes",
        competitor: "Often longer",
      },
    ],
    faq: [
      {
        question: "Who should pick Social0 over Hootsuite?",
        answer:
          "Solo creators, indie founders, and small teams who want scheduling and publishing without an enterprise suite or a long setup path.",
      },
      {
        question: "Does Social0 have team features?",
        answer:
          "Yes — you can invite teammates from the dashboard. Social0 stays focused on publishing rather than full enterprise social suites.",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "linkedin-scheduler"],
  },
  {
    slug: "later",
    competitorName: "Later",
    metaTitle: "Later Alternative - Social0 | Schedule Beyond Instagram",
    metaDescription:
      "Later alternative for scheduling across X, LinkedIn, TikTok, YouTube, Threads, Bluesky, and more — not just visual-first networks.",
    keywords: ["later alternative", "later vs social0", "instagram scheduler"],
    heroHeadline: "A Later alternative for every platform you post on",
    heroSubheadline:
      "Later excels at visual planning. Social0 is for creators who need one place for text, images, and video everywhere.",
    intro:
      "Later is popular for Instagram planning. Social0 targets creators who also post on X, LinkedIn, TikTok, YouTube, Threads, and Bluesky — without stacking a separate tool per network.",
    whySwitch: [
      "Strong support for text-first platforms (X, LinkedIn, Bluesky, Threads)",
      "Image and video posts with per-platform validation",
      "Calendar view for everything scheduled",
      "Multiple accounts per platform on paid plans",
      "One workflow instead of stacking single-network tools",
    ],
    comparisonRows: [
      {
        feature: "Instagram scheduling",
        social0: "Yes",
        competitor: "Core strength",
      },
      {
        feature: "X / LinkedIn / Bluesky",
        social0: "Native",
        competitor: "Secondary to visual focus",
      },
      {
        feature: "Unified composer",
        social0: "Yes",
        competitor: "Visual-first workflow",
      },
      {
        feature: "Parallel publishing",
        social0: "All selected accounts at once",
        competitor: "Per-network flow",
      },
    ],
    faq: [
      {
        question: "Is Social0 better than Later for Instagram?",
        answer:
          "Both support Instagram scheduling. Choose Social0 when Instagram is one of several platforms you publish to and you want one dashboard for all of them.",
      },
    ],
    relatedFeatureSlugs: ["instagram-scheduler", "tiktok-scheduler"],
  },
  {
    slug: "metricool",
    competitorName: "Metricool",
    metaTitle: "Metricool Alternative - Social0 | Focused Publishing",
    metaDescription:
      "Metricool alternative focused on scheduling and publishing. Social0 prioritizes a fast compose-once workflow over analytics dashboards.",
    keywords: ["metricool alternative", "metricool vs social0"],
    heroHeadline: "A Metricool alternative focused on publishing speed",
    heroSubheadline:
      "When your bottleneck is posting — not reporting — Social0 gets content live faster.",
    intro:
      "Metricool bundles scheduling with analytics and ads reporting. Social0 focuses on the publish path: connect accounts, compose, schedule or post now, and see clear per-platform results.",
    whySwitch: [
      "Publish-first UX without analytics clutter",
      "Parallel publishing to every selected account",
      "Drafts, scheduled posts, and calendar in one place",
      "Encrypted OAuth token storage",
      "Built for indie creators and small teams",
    ],
    comparisonRows: [
      {
        feature: "Primary focus",
        social0: "Publishing & scheduling",
        competitor: "Analytics + scheduling",
      },
      {
        feature: "Compose once",
        social0: "Yes",
        competitor: "Yes",
      },
      {
        feature: "Ads reporting",
        social0: "Not included",
        competitor: "Included",
      },
      {
        feature: "Per-platform publish status",
        social0: "Yes",
        competitor: "Varies",
      },
    ],
    faq: [
      {
        question: "Does Social0 replace Metricool analytics?",
        answer:
          "No. Social0 does not try to replace full analytics suites. It removes the friction of posting and scheduling across many platforms.",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "twitter-scheduler"],
  },
  {
    slug: "publer",
    competitorName: "Publer",
    metaTitle: "Publer Alternative - Social0 | Multi-Platform Scheduling",
    metaDescription:
      "Publer alternative with a compose-once workflow for X, LinkedIn, Instagram, TikTok, YouTube, Threads, Bluesky, and more.",
    keywords: [
      "publer alternative",
      "publer vs social0",
      "social media scheduler",
    ],
    heroHeadline: "A Publer alternative with parallel publishing",
    heroSubheadline:
      "Publer covers many networks. Social0 focuses on one composer and simultaneous publishing to every account you select.",
    intro:
      "Publer is a capable scheduler with workspaces and analytics. Social0 is leaner: connect accounts, compose once, publish in parallel, and see per-platform results — ideal when speed matters more than agency-style workspaces.",
    whySwitch: [
      "Parallel publish to all selected accounts at once",
      "No workspace complexity for solo creators",
      "Native Threads and Bluesky support",
      "Per-platform captions and validation",
      "Clear success / fail feedback per network",
    ],
    comparisonRows: [
      {
        feature: "Compose once",
        social0: "Yes — parallel publish",
        competitor: "Yes — per-network queues",
      },
      {
        feature: "Threads & Bluesky",
        social0: "Native",
        competitor: "Supported",
      },
      {
        feature: "Focus",
        social0: "Publish-first",
        competitor: "Scheduling + analytics",
      },
      {
        feature: "Best for",
        social0: "Indie creators & small teams",
        competitor: "Teams wanting workspaces",
      },
    ],
    faq: [
      {
        question: "Is Social0 a good Publer alternative?",
        answer:
          "If you want a faster compose-once workflow without workspace overhead, Social0 is a strong fit for multi-platform publishing.",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "threads-scheduler"],
  },
  {
    slug: "sprout-social",
    competitorName: "Sprout Social",
    metaTitle: "Sprout Social Alternative - Social0 | Focused Scheduling",
    metaDescription:
      "Sprout Social alternative for creators who need scheduling and publishing without enterprise suites or heavy onboarding.",
    keywords: [
      "sprout social alternative",
      "sprout social vs social0",
      "social media scheduler",
    ],
    heroHeadline: "A Sprout Social alternative without enterprise weight",
    heroSubheadline:
      "Sprout Social is built for large teams and analytics. Social0 is built for getting content published across every platform you use.",
    intro:
      "Sprout Social offers inbox management, listening, and reporting for larger orgs. Social0 focuses on the publish path — scheduling, drafts, calendar, and multi-platform posting — for creators and small teams who just need content live.",
    whySwitch: [
      "Publish-first UX without analytics clutter",
      "Nine platforms including Bluesky and Threads",
      "Minutes to first scheduled post",
      "Parallel publishing with clear per-platform results",
      "Simple plans without enterprise seat mazes",
    ],
    comparisonRows: [
      {
        feature: "Primary focus",
        social0: "Scheduling & publishing",
        competitor: "Enterprise social suite",
      },
      {
        feature: "Onboarding",
        social0: "Minutes",
        competitor: "Longer setup",
      },
      {
        feature: "Social listening",
        social0: "Not included",
        competitor: "Included",
      },
      {
        feature: "Parallel publishing",
        social0: "Yes",
        competitor: "Available in suite",
      },
    ],
    faq: [
      {
        question: "Who should choose Social0 over Sprout Social?",
        answer:
          "Creators and small teams who need reliable multi-platform scheduling without paying for enterprise analytics, listening, or inbox tools.",
      },
    ],
    relatedFeatureSlugs: [
      "multi-platform-scheduler",
      "linkedin-scheduler",
      "social-media-calendar",
    ],
  },
];

export const ALTERNATIVE_SLUGS = ALTERNATIVES.map((a) => a.slug);

export function getAlternative(slug: string): AlternativePage | undefined {
  return ALTERNATIVES.find((a) => a.slug === slug);
}
