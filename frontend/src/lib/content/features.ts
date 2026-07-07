export type FeaturePage = {
  slug: string;
  platformLabel?: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  heroHeadline: string;
  heroSubheadline: string;
  intro: string;
  benefits: { title: string; description: string }[];
  howItWorks: { step: number; title: string; description: string }[];
  faq: { question: string; answer: string }[];
  relatedAlternativeSlugs: string[];
};

export const FEATURES: FeaturePage[] = [
  {
    slug: "threads-scheduler",
    platformLabel: "Threads",
    metaTitle: "Threads Scheduler - Schedule Meta Threads Posts | Social0",
    metaDescription:
      "Schedule Threads posts from one dashboard. Compose text, images, and videos, pick your Threads account, and publish or schedule with Social0.",
    keywords: [
      "threads scheduler",
      "schedule threads posts",
      "meta threads scheduling tool",
      "threads social media scheduler",
    ],
    heroHeadline: "Threads scheduler built into your multi-platform workflow",
    heroSubheadline:
      "Stop opening the Threads app for every post. Draft, schedule, and publish alongside X, Instagram, and LinkedIn.",
    intro:
      "Threads shares Meta's ecosystem but deserves its own publishing workflow. Social0 connects your Threads account via official OAuth, respects caption and media limits, and lets you schedule posts on a calendar next to every other platform you use.",
    benefits: [
      {
        title: "Official Threads OAuth",
        description:
          "Connect securely with Meta's Threads API. Tokens are encrypted at rest and refreshed before they expire.",
      },
      {
        title: "Text, images, and video",
        description:
          "Publish the content types Threads supports without re-uploading in a separate app.",
      },
      {
        title: "Schedule or post now",
        description:
          "Queue Threads content for later or send it live with your other networks in one action.",
      },
      {
        title: "Multiple Threads accounts",
        description:
          "Manage more than one profile when your plan allows multiple connections per platform.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect Threads",
        description:
          "Authorize Social0 from your dashboard Connections page using Meta's OAuth flow.",
      },
      {
        step: 2,
        title: "Compose your post",
        description:
          "Write your caption, attach media if needed, and select your Threads account.",
      },
      {
        step: 3,
        title: "Schedule or publish",
        description:
          "Pick a time on the calendar or hit Post now. Social0 handles the API publish call.",
      },
    ],
    faq: [
      {
        question: "Can I schedule Threads posts in advance?",
        answer:
          "Yes. Social0 supports scheduled publishing to Threads alongside your other connected platforms.",
      },
      {
        question: "Does Social0 support Threads threads (multi-post)?",
        answer:
          "Social0 supports Threads content types available through the connected API. Check the composer for thread-style posts supported on your account.",
      },
    ],
    relatedAlternativeSlugs: ["buffer", "later"],
  },
  {
    slug: "bluesky-scheduling-tool",
    platformLabel: "Bluesky",
    metaTitle: "Bluesky Scheduling Tool - Schedule AT Protocol Posts | Social0",
    metaDescription:
      "Bluesky scheduling tool for creators on the AT Protocol. Connect with your handle, compose posts, and schedule or publish from Social0.",
    keywords: [
      "bluesky scheduling tool",
      "bluesky scheduler",
      "schedule bluesky posts",
      "at protocol scheduler",
    ],
    heroHeadline: "Bluesky scheduling tool for the open social web",
    heroSubheadline:
      "Connect your Bluesky handle, write posts once, and schedule them without a separate bot or script.",
    intro:
      "Bluesky uses a bring-your-own-key connection instead of classic OAuth. Social0 lets you connect your handle securely, compose within Bluesky's character limits, and schedule posts like any other platform in your stack.",
    benefits: [
      {
        title: "BYOK connection",
        description:
          "Connect with your Bluesky handle and app password using Social0's secure flow - no custom scripts.",
      },
      {
        title: "Caption limits enforced",
        description:
          "The composer shows remaining characters so you stay within Bluesky's limits before publishing.",
      },
      {
        title: "Part of a multi-platform stack",
        description:
          "Schedule Bluesky alongside X, Threads, and LinkedIn from the same dashboard.",
      },
      {
        title: "Scheduled and instant publish",
        description:
          "Queue posts for peak hours or publish immediately when news breaks.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Add your Bluesky handle",
        description:
          "Enter your handle and app password in the Connections flow. Credentials are encrypted server-side.",
      },
      {
        step: 2,
        title: "Create your post",
        description: "Write text and attach images supported by Bluesky's API.",
      },
      {
        step: 3,
        title: "Schedule or go live",
        description:
          "Choose a schedule time or publish now with your other selected accounts.",
      },
    ],
    faq: [
      {
        question: "Is Bluesky scheduling safe with Social0?",
        answer:
          "Social0 stores credentials encrypted and uses them only to publish on your behalf. You can disconnect at any time from Connections.",
      },
      {
        question: "Do I need a Bluesky app password?",
        answer:
          "Yes. Bluesky uses app passwords for third-party clients. Generate one in Bluesky settings and paste it during connect.",
      },
    ],
    relatedAlternativeSlugs: ["buffer"],
  },
  {
    slug: "tiktok-scheduler",
    platformLabel: "TikTok",
    metaTitle: "TikTok Scheduler - Schedule TikTok Videos & Photos | Social0",
    metaDescription:
      "TikTok scheduler for videos and photo posts. Set privacy, titles, and publish or schedule TikTok content from Social0.",
    keywords: [
      "tiktok scheduler",
      "schedule tiktok posts",
      "tiktok content scheduler",
    ],
    heroHeadline: "TikTok scheduler with Direct Post support",
    heroSubheadline:
      "Upload video or images, configure TikTok-specific settings, and schedule from the same composer you use for every network.",
    intro:
      "TikTok publishing has extra requirements - titles, privacy levels, and media rules. Social0's TikTok composer captures those settings, processes images when needed, and schedules or publishes through TikTok's Content Posting API.",
    benefits: [
      {
        title: "Video and photo posts",
        description:
          "Publish short videos and supported photo carousels without a separate TikTok workflow.",
      },
      {
        title: "TikTok-specific settings",
        description:
          "Privacy, title, and branded content toggles live in the composer so nothing is missed at publish time.",
      },
      {
        title: "Scheduling built in",
        description:
          "Queue TikTok content for optimal times alongside Instagram Reels and YouTube Shorts.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect TikTok",
        description:
          "Authorize via TikTok Login Kit with the scopes required for publishing.",
      },
      {
        step: 2,
        title: "Upload and configure",
        description:
          "Add media, set TikTok title and privacy, and confirm posting consent.",
      },
      {
        step: 3,
        title: "Schedule or publish",
        description: "Pick a time or post immediately.",
      },
    ],
    faq: [
      {
        question: "Does Social0 support scheduled TikTok posts?",
        answer:
          "Yes, when your TikTok account is connected and approved for the Content Posting API.",
      },
    ],
    relatedAlternativeSlugs: ["later", "buffer"],
  },
  {
    slug: "instagram-scheduler",
    platformLabel: "Instagram",
    metaTitle: "Instagram Scheduler - Schedule Posts & Reels | Social0",
    metaDescription:
      "Instagram scheduler for images, carousels, and reels. Connect via Instagram or Facebook Page and schedule from Social0.",
    keywords: [
      "instagram scheduler",
      "schedule instagram posts",
      "instagram reel scheduler",
    ],
    heroHeadline: "Instagram scheduler without leaving your main workflow",
    heroSubheadline:
      "Connect Instagram directly or via a linked Facebook Page, then schedule posts with the rest of your content calendar.",
    intro:
      "Instagram publishing often means jumping between Meta Business tools. Social0 supports direct Instagram OAuth and Facebook Page-linked Instagram accounts so you can schedule feed posts and reels from the same composer as X, LinkedIn, and TikTok.",
    benefits: [
      {
        title: "Two connection paths",
        description:
          "Connect Instagram directly or through a Facebook Page when that fits your setup.",
      },
      {
        title: "Carousel and reel support",
        description:
          "Publish the formats your Instagram account supports from one upload flow.",
      },
      {
        title: "Calendar scheduling",
        description:
          "Line up Instagram content with launches on other platforms.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect Instagram",
        description:
          "Choose direct OAuth or Facebook Page linking in Connections.",
      },
      {
        step: 2,
        title: "Compose with media",
        description:
          "Add images or video and write your caption with limit indicators.",
      },
      {
        step: 3,
        title: "Schedule",
        description: "Set a publish time or post now.",
      },
    ],
    faq: [
      {
        question: "Can I connect multiple Instagram accounts?",
        answer:
          "Yes, within your plan's account limits. Each account appears separately in the composer.",
      },
    ],
    relatedAlternativeSlugs: ["later", "buffer"],
  },
  {
    slug: "linkedin-scheduler",
    platformLabel: "LinkedIn",
    metaTitle: "LinkedIn Scheduler - Schedule Posts & Articles | Social0",
    metaDescription:
      "LinkedIn scheduler for professionals and founders. Schedule text, images, and video posts to LinkedIn from Social0.",
    keywords: [
      "linkedin scheduler",
      "schedule linkedin posts",
      "linkedin post scheduler",
    ],
    heroHeadline: "LinkedIn scheduler for founders and operators",
    heroSubheadline:
      "Draft thought leadership once, schedule it, and publish to LinkedIn with your other channels.",
    intro:
      "LinkedIn rewards consistency. Social0 connects via official OAuth, supports text and media posts, and slots LinkedIn into your weekly calendar next to X and Threads so you never forget a workday post.",
    benefits: [
      {
        title: "Professional publishing",
        description:
          "Post text, images, and video with LinkedIn's limits enforced in the UI.",
      },
      {
        title: "Token refresh",
        description:
          "Expired tokens are refreshed automatically before publish when possible.",
      },
      {
        title: "Multi-account",
        description: "Manage personal and company pages when your plan allows.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect LinkedIn",
        description: "Authorize with LinkedIn OAuth from Connections.",
      },
      {
        step: 2,
        title: "Write your post",
        description: "Compose in the editor with character guidance.",
      },
      {
        step: 3,
        title: "Schedule or publish",
        description: "Queue for business hours or publish immediately.",
      },
    ],
    faq: [
      {
        question: "Does Social0 support LinkedIn company pages?",
        answer:
          "Social0 connects LinkedIn accounts available through the authorized OAuth scopes. Connect the profile or pages your LinkedIn app access allows.",
      },
    ],
    relatedAlternativeSlugs: ["hootsuite", "buffer"],
  },
  {
    slug: "twitter-scheduler",
    platformLabel: "X (Twitter)",
    metaTitle: "X / Twitter Scheduler - Schedule Tweets & Threads | Social0",
    metaDescription:
      "X and Twitter scheduler with support for long posts on Premium accounts. Schedule tweets, threads, and media from Social0.",
    keywords: [
      "twitter scheduler",
      "x scheduler",
      "schedule tweets",
      "tweet scheduler",
    ],
    heroHeadline: "X / Twitter scheduler with Premium-aware limits",
    heroSubheadline:
      "Schedule tweets and threads. Social0 detects X Premium so long-form posts use the right character limit.",
    intro:
      "X publishing needs OAuth 1.0a and careful handling of character limits - 280 for standard accounts, up to 25,000 for Premium. Social0 connects your X accounts, respects Premium status, and lets you schedule single posts and threads.",
    benefits: [
      {
        title: "Premium character limits",
        description:
          "Connected Premium accounts get the extended limit automatically in the composer.",
      },
      {
        title: "Threads support",
        description:
          "Publish multi-post threads without manual reply chaining.",
      },
      {
        title: "Media attachments",
        description: "Add images and video to scheduled tweets.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect X",
        description: "Authorize via X's OAuth flow from Connections.",
      },
      {
        step: 2,
        title: "Compose tweet or thread",
        description: "Write content with live character counts per account.",
      },
      {
        step: 3,
        title: "Schedule",
        description: "Pick a time or post now across all selected networks.",
      },
    ],
    faq: [
      {
        question: "Does Social0 support X Premium long posts?",
        answer:
          "Yes. Social0 reads Premium status on connect and when you refresh it from Connections.",
      },
    ],
    relatedAlternativeSlugs: ["buffer", "metricool"],
  },
  {
    slug: "multi-platform-scheduler",
    metaTitle: "Multi-Platform Social Media Scheduler | Social0",
    metaDescription:
      "Multi-platform social media scheduler. Write once and publish to X, LinkedIn, Instagram, TikTok, YouTube, Threads, Bluesky, Facebook, and Pinterest.",
    keywords: [
      "multi platform scheduler",
      "social media scheduler",
      "publish to all socials",
      "cross platform posting tool",
    ],
    heroHeadline: "Multi-platform scheduler - one composer, every network",
    heroSubheadline:
      "The core Social0 workflow: compose once, select accounts, schedule or publish in parallel.",
    intro:
      "Most schedulers still treat each network as a separate queue. Social0 is built around parallel publishing - you write one post, pick every account that should receive it, and Social0 sends to each platform with per-network validation and clear success/failure feedback.",
    benefits: [
      {
        title: "9+ platforms",
        description:
          "X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest.",
      },
      {
        title: "Parallel publish",
        description:
          "All selected accounts fire at once. One failure does not block the rest.",
      },
      {
        title: "One calendar",
        description: "Every scheduled post appears in a single calendar view.",
      },
      {
        title: "Drafts and bulk tools",
        description: "Save drafts and use bulk scheduling on supported plans.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect your accounts",
        description: "Link every platform you publish to from Connections.",
      },
      {
        step: 2,
        title: "Compose once",
        description: "Write caption, add media, and select target accounts.",
      },
      {
        step: 3,
        title: "Publish or schedule everywhere",
        description:
          "Post now or set one schedule time for all selected networks.",
      },
    ],
    faq: [
      {
        question: "What makes Social0 a multi-platform scheduler?",
        answer:
          "A single composer and parallel publishing pipeline - not separate queues per network that you fill one by one.",
      },
    ],
    relatedAlternativeSlugs: ["buffer", "hootsuite", "later"],
  },
  {
    slug: "social-media-calendar",
    metaTitle: "Social Media Calendar - Plan & Schedule Posts | Social0",
    metaDescription:
      "Social media content calendar to view scheduled and published posts across all connected platforms in Social0.",
    keywords: [
      "social media calendar",
      "content calendar tool",
      "social scheduling calendar",
    ],
    heroHeadline: "Social media calendar for your entire stack",
    heroSubheadline:
      "See scheduled, published, and draft posts across every connected account in one calendar.",
    intro:
      "A content calendar only helps if it shows everything in one place. Social0's calendar aggregates scheduled and published posts from all connected platforms so you can spot gaps, avoid double-posting, and plan campaigns visually.",
    benefits: [
      {
        title: "Cross-platform view",
        description: "Every network on one calendar - no spreadsheet sidecars.",
      },
      {
        title: "Scheduled and posted history",
        description: "Review what went out and what is still queued.",
      },
      {
        title: "Tied to the composer",
        description:
          "Click through to edit drafts or reschedule from the same app.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Schedule posts",
        description: "Use the composer to queue content with a date and time.",
      },
      {
        step: 2,
        title: "Open Calendar",
        description: "View the month or week across all platforms.",
      },
      {
        step: 3,
        title: "Adjust as needed",
        description: "Edit drafts or reschedule before publish time.",
      },
    ],
    faq: [
      {
        question: "Does the calendar show all platforms?",
        answer:
          "Yes. Scheduled and published posts from connected accounts appear in the calendar view.",
      },
    ],
    relatedAlternativeSlugs: ["buffer", "later"],
  },
  {
    slug: "youtube-scheduler",
    platformLabel: "YouTube",
    metaTitle: "YouTube Scheduler - Schedule Shorts & Videos | Social0",
    metaDescription:
      "YouTube scheduler for Shorts and videos. Upload, set title and visibility, and schedule YouTube content from Social0 alongside your other platforms.",
    keywords: [
      "youtube scheduler",
      "schedule youtube shorts",
      "youtube video scheduler",
      "social media scheduler youtube",
    ],
    heroHeadline: "YouTube scheduler for Shorts and long-form video",
    heroSubheadline:
      "Connect your channel, upload video, and schedule YouTube posts without a separate workflow.",
    intro:
      "YouTube publishing usually means opening Studio or a dedicated tool. Social0 connects via Google OAuth, supports video uploads within platform limits, and lets you schedule Shorts and videos on the same calendar as Instagram Reels and TikTok.",
    benefits: [
      {
        title: "Google OAuth connection",
        description:
          "Connect your YouTube channel securely. Tokens are encrypted and refreshed automatically.",
      },
      {
        title: "Shorts and video support",
        description:
          "Publish vertical Shorts and standard videos from the same composer.",
      },
      {
        title: "Unified calendar",
        description:
          "Line up YouTube releases with launches on X, LinkedIn, and TikTok.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect YouTube",
        description: "Authorize with Google from the Connections page.",
      },
      {
        step: 2,
        title: "Upload video",
        description: "Add your video file and write title and description.",
      },
      {
        step: 3,
        title: "Schedule or publish",
        description: "Pick a time or post immediately.",
      },
    ],
    faq: [
      {
        question: "Can I schedule YouTube Shorts with Social0?",
        answer:
          "Yes. Upload vertical video and schedule it like any other platform in Social0.",
      },
      {
        question: "Does Social0 replace YouTube Studio?",
        answer:
          "Social0 handles scheduling and publishing. Advanced Studio features like end screens remain in YouTube Studio.",
      },
    ],
    relatedAlternativeSlugs: ["buffer", "metricool"],
  },
  {
    slug: "pinterest-scheduler",
    platformLabel: "Pinterest",
    metaTitle: "Pinterest Scheduler - Schedule Pins & Idea Pins | Social0",
    metaDescription:
      "Pinterest scheduler to publish pins to boards you choose. Schedule images and video pins from Social0's multi-platform composer.",
    keywords: [
      "pinterest scheduler",
      "schedule pinterest pins",
      "pinterest pin scheduler",
    ],
    heroHeadline: "Pinterest scheduler with board selection",
    heroSubheadline:
      "Pick your board, add your pin, and schedule alongside Instagram and TikTok.",
    intro:
      "Pinterest needs the right board and image specs. Social0 connects via Pinterest OAuth, lets you select boards at compose time, and schedules pins on your content calendar next to every other network.",
    benefits: [
      {
        title: "Board picker",
        description:
          "Choose which board each pin lands on without leaving the composer.",
      },
      {
        title: "Image and video pins",
        description:
          "Publish supported pin formats with per-platform validation.",
      },
      {
        title: "Part of one stack",
        description:
          "Schedule Pinterest with the same post workflow you use for X and LinkedIn.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect Pinterest",
        description: "Authorize via Pinterest OAuth from Connections.",
      },
      {
        step: 2,
        title: "Select board and media",
        description:
          "Upload your pin image or video and pick a destination board.",
      },
      {
        step: 3,
        title: "Schedule",
        description: "Queue for later or publish now.",
      },
    ],
    faq: [
      {
        question: "Can I schedule to multiple Pinterest boards?",
        answer:
          "Each publish targets the board you select in the composer for that post.",
      },
    ],
    relatedAlternativeSlugs: ["later", "buffer"],
  },
  {
    slug: "facebook-scheduler",
    platformLabel: "Facebook",
    metaTitle: "Facebook Page Scheduler - Schedule Page Posts | Social0",
    metaDescription:
      "Facebook Page scheduler for text, images, and video. Connect your Page via Meta OAuth and schedule posts from Social0.",
    keywords: [
      "facebook scheduler",
      "facebook page scheduler",
      "schedule facebook posts",
      "meta page scheduling",
    ],
    heroHeadline: "Facebook Page scheduler built into Social0",
    heroSubheadline:
      "Schedule posts to Facebook Pages - not personal profiles - from the same dashboard as Instagram and Threads.",
    intro:
      "Facebook Page publishing requires Meta permissions and the right account type. Social0 connects Facebook Pages via official OAuth, supports text, images, and video posts, and schedules them on your unified calendar.",
    benefits: [
      {
        title: "Page-only publishing",
        description:
          "Built for Facebook Pages - the format businesses and creators actually use.",
      },
      {
        title: "Multi-photo and video",
        description:
          "Publish image carousels and video posts supported by the Graph API.",
      },
      {
        title: "Works with Instagram",
        description:
          "Manage Meta properties alongside Instagram from one composer.",
      },
    ],
    howItWorks: [
      {
        step: 1,
        title: "Connect your Page",
        description: "Authorize via Facebook OAuth and select your Page.",
      },
      {
        step: 2,
        title: "Compose",
        description: "Write your post and attach images or video.",
      },
      {
        step: 3,
        title: "Schedule or publish",
        description: "Set a time or post immediately.",
      },
    ],
    faq: [
      {
        question: "Does Social0 support personal Facebook profiles?",
        answer:
          "No. Social0 publishes to Facebook Pages only, per Meta API requirements.",
      },
      {
        question: "Can I schedule Facebook and Instagram together?",
        answer:
          "Yes. Select both accounts in the composer and publish or schedule in one action.",
      },
    ],
    relatedAlternativeSlugs: ["buffer", "hootsuite"],
  },
];

export const FEATURE_SLUGS = FEATURES.map((f) => f.slug);

export function getFeature(slug: string): FeaturePage | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
