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
      "Compose once, publish everywhere - without juggling queues per network or paying for platforms you do not use.",
    intro:
      "Buffer is great for queue-based scheduling, but teams that post across many networks often end up duplicating captions, switching tabs, and paying for add-ons. Social0 is built around one composer and parallel publishing to 9+ platforms, with scheduling, drafts, and a calendar in the same workflow.",
    whySwitch: [
      "One composer for text, images, videos, threads, and collections",
      "Publish to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest",
      "See per-platform results when a publish partially fails",
      "3-day free trial on all plans - no credit card games",
      "Transparent pricing without per-channel upsells",
    ],
    comparisonRows: [
      {
        feature: "Compose once, publish everywhere",
        social0: "Yes - single composer",
        competitor: "Mostly per-channel queues",
      },
      {
        feature: "Platforms supported",
        social0: "9+ including Bluesky & Threads",
        competitor: "Strong core set; varies by plan",
      },
      {
        feature: "Parallel publishing",
        social0: "All selected accounts at once",
        competitor: "Sequential / per-queue",
      },
      {
        feature: "Free trial",
        social0: "7 days on every plan",
        competitor: "Limited free tier",
      },
      {
        feature: "Built for indie creators & small teams",
        social0: "Yes",
        competitor: "Yes",
      },
    ],
    faq: [
      {
        question: "Is Social0 a good Buffer alternative?",
        answer:
          "If you post to more than one or two platforms and want one workflow instead of separate queues, Social0 is a strong Buffer alternative. You write once, pick accounts, and publish or schedule in a single step.",
      },
      {
        question: "Can I migrate scheduled posts from Buffer?",
        answer:
          "Export your content from Buffer and recreate posts in Social0's composer. There is no automatic importer yet, but drafts and scheduling are quick once accounts are connected.",
      },
      {
        question: "Does Social0 support the same platforms as Buffer?",
        answer:
          "Social0 supports X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest. Compare your current Buffer channels against this list before switching.",
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
      "Hootsuite alternative for creators and small teams. Social0 offers focused scheduling and publishing without enterprise complexity or per-seat pricing.",
    keywords: [
      "hootsuite alternative",
      "hootsuite vs social0",
      "social media management tool",
    ],
    heroHeadline: "A Hootsuite alternative without the enterprise overhead",
    heroSubheadline:
      "Schedule and publish across major platforms from one clean dashboard - built for speed, not boardrooms.",
    intro:
      "Hootsuite pioneered social media management for agencies and enterprises. If you need a lighter tool that still handles multi-platform publishing, scheduling, and multiple accounts per network, Social0 focuses on the workflow creators actually use daily.",
    whySwitch: [
      "Faster onboarding - connect accounts and post in minutes",
      "No per-seat pricing maze for small teams",
      "Unified composer instead of separate stream tabs",
      "Scheduling calendar and drafts built in",
      "OAuth-only connections - we never store your passwords",
    ],
    comparisonRows: [
      {
        feature: "Target user",
        social0: "Creators & lean teams",
        competitor: "Agencies & enterprise",
      },
      {
        feature: "Pricing complexity",
        social0: "Simple tiered plans",
        competitor: "Higher tiers & add-ons",
      },
      {
        feature: "Multi-platform composer",
        social0: "Native",
        competitor: "Available",
      },
      {
        feature: "Time to first post",
        social0: "Minutes",
        competitor: "Often longer setup",
      },
    ],
    faq: [
      {
        question: "Who should pick Social0 over Hootsuite?",
        answer:
          "Solo creators, indie founders, and small teams who want scheduling and publishing without enterprise analytics suites or per-user fees are a better fit for Social0.",
      },
      {
        question: "Does Social0 have team features?",
        answer:
          "Team collaboration is on the roadmap. Today Social0 is optimized for individuals and small teams who manage their own accounts.",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "linkedin-scheduler"],
  },
  {
    slug: "later",
    competitorName: "Later",
    metaTitle: "Later Alternative - Social0 | Schedule Beyond Instagram",
    metaDescription:
      "Later alternative for scheduling across X, LinkedIn, TikTok, YouTube, Threads, Bluesky, and more - not just visual-first networks.",
    keywords: ["later alternative", "later vs social0", "instagram scheduler"],
    heroHeadline: "A Later alternative for every platform you post on",
    heroSubheadline:
      "Later excels at visual planning. Social0 is built for creators who need one place to schedule text, images, and video everywhere.",
    intro:
      "Later is popular for Instagram planning and link-in-bio. Social0 targets the same creators who also post on X, LinkedIn, TikTok, YouTube, and newer networks like Threads and Bluesky - without maintaining separate tools per platform.",
    whySwitch: [
      "Strong support for text-first platforms (X, LinkedIn, Bluesky, Threads)",
      "Video and image posts with per-platform validation",
      "Calendar view for all scheduled content",
      "Multiple accounts per platform on supported plans",
      "One bill instead of stacking single-network tools",
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
        competitor: "Limited vs visual focus",
      },
      {
        feature: "Unified composer",
        social0: "Yes",
        competitor: "Visual-first workflow",
      },
      {
        feature: "Free trial",
        social0: "7 days",
        competitor: "Free tier available",
      },
    ],
    faq: [
      {
        question: "Is Social0 better than Later for Instagram?",
        answer:
          "Both support Instagram scheduling. Choose Social0 if Instagram is one of several platforms you publish to and you want one dashboard for all of them.",
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
      "When your bottleneck is posting - not reporting - Social0 gets content live faster.",
    intro:
      "Metricool bundles scheduling with analytics and ads reporting. Social0 deliberately focuses on the publish path: connect accounts, compose, schedule or post now, and see clear per-platform results.",
    whySwitch: [
      "Publish-first UX without analytics clutter",
      "Parallel publishing to every selected account",
      "Drafts, scheduled posts, and calendar in one app",
      "Encrypted OAuth token storage",
      "Affordable plans for indie creators",
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
    ],
    faq: [
      {
        question: "Does Social0 replace Metricool analytics?",
        answer:
          "No. Social0 does not try to replace full analytics suites. It replaces the friction of posting and scheduling across many platforms.",
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
      "Publer handles many networks well. Social0 focuses on one composer and simultaneous publishing to every account you select.",
    intro:
      "Publer is a capable scheduler with workspaces and analytics. Social0 is leaner: connect accounts, compose once, publish in parallel, and see per-platform results - ideal when speed matters more than agency-style workspaces.",
    whySwitch: [
      "Parallel publish to all selected accounts at once",
      "No workspace complexity for solo creators",
      "Threads and Bluesky native support",
      "3-day free trial on every plan",
      "Clear per-platform publish feedback",
    ],
    comparisonRows: [
      {
        feature: "Compose once",
        social0: "Yes - parallel publish",
        competitor: "Yes - per-network queues",
      },
      {
        feature: "Threads & Bluesky",
        social0: "Native",
        competitor: "Supported",
      },
      {
        feature: "Analytics focus",
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
          "If you want a faster compose-once workflow without workspace overhead, Social0 is a strong Publer alternative for multi-platform publishing.",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "threads-scheduler"],
  },
  {
    slug: "sprout-social",
    competitorName: "Sprout Social",
    metaTitle: "Sprout Social Alternative - Social0 | Affordable Scheduling",
    metaDescription:
      "Sprout Social alternative for creators who need scheduling and publishing without enterprise pricing or analytics suites.",
    keywords: [
      "sprout social alternative",
      "sprout social vs social0",
      "cheap social media scheduler",
    ],
    heroHeadline: "A Sprout Social alternative without enterprise pricing",
    heroSubheadline:
      "Sprout Social is built for large teams and analytics. Social0 is built for getting content published across every platform you use.",
    intro:
      "Sprout Social offers inbox management, listening, and reporting at a premium price point. Social0 deliberately focuses on the publish path - scheduling, drafts, calendar, and multi-platform posting - at a fraction of the cost for solo creators and small teams.",
    whySwitch: [
      "Affordable plans with 3-day free trial",
      "No per-seat enterprise pricing",
      "Publish-first UX without analytics clutter",
      "9+ platforms including Bluesky and Threads",
      "Minutes to first scheduled post",
    ],
    comparisonRows: [
      {
        feature: "Primary focus",
        social0: "Scheduling & publishing",
        competitor: "Enterprise social suite",
      },
      {
        feature: "Pricing",
        social0: "Creator-friendly tiers",
        competitor: "Higher per-seat cost",
      },
      {
        feature: "Social listening",
        social0: "Not included",
        competitor: "Included",
      },
      {
        feature: "Time to value",
        social0: "Minutes",
        competitor: "Longer onboarding",
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
