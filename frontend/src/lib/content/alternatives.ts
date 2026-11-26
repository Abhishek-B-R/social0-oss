import { CATALOG_ALTERNATIVES } from "./alternatives-catalog";
import type { AlternativePage, ComparisonRow } from "./alternative-page-types";

export type { AlternativePage, ComparisonRow };

/** Hand-written pages first; a catalog page with the same slug is dropped below. */
const ALL_ALTERNATIVES: AlternativePage[] = [
  {
    slug: "buffer",
    competitorName: "Buffer",
    metaTitle: "Buffer Alternative: 15 Accounts for $29.90 | Social0",
    metaDescription:
      "Buffer charges $5-10 per channel per month. Social0 is $29.90/mo for 15 accounts with unlimited posts and API, MCP and CLI on every plan, free to start.",
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
      "Buffer prices per channel: Essentials is $5 per channel per month and Team $10, with a Free plan of 3 channels and 10 scheduled posts each; its API is on every plan and it offers an MCP connector (buffer.com/pricing, checked 2026-11-19). Social0 prices per plan: Creator is $29.90/month for 15 accounts and Agency $59.90/month for 59 accounts plus $1 per extra, with unlimited posts on paid plans and the REST API, MCP server and CLI on every plan.",
    whySwitch: [
      "One composer for text, images, video, threads, and carousels",
      "Publish to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Threads, Bluesky, and Pinterest",
      "Parallel publishing — every selected account at once",
      "Per-platform captions when you need a different hook",
      "Calendar, drafts, and scheduled posts in the same workflow",
    ],
    comparisonRows: [
      { feature: "How it's priced", social0: "Per plan: $29.90/mo for 15 accounts", competitor: "Per channel: $5/mo Essentials, $10/mo Team" },
      { feature: "10 accounts", social0: "$29.90/mo (Creator covers 15)", competitor: "$50/mo on Essentials" },
      { feature: "Free plan", social0: "3 accounts, 10 posts", competitor: "3 channels, 10 scheduled posts each" },
      { feature: "API and MCP", social0: "REST API, MCP server and CLI on every plan", competitor: "API on every plan; Buffer MCP connector" },
      { feature: "Export scheduled posts", social0: "Ask support", competitor: "Not available (Buffer help center)" },
      { feature: "Networks", social0: "9 incl. Bluesky and Threads", competitor: "Also Google Business Profile, Mastodon, Substack" },
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
          "Buffer has no export for scheduled posts (per its help center), so copy the ones you want to keep before you cancel, then paste them into the Social0 composer and schedule them. There is no automatic importer yet. Step-by-step: [how to cancel Buffer](/blog/how-to-cancel-buffer).",
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
    metaTitle: "Hootsuite Alternative From $29.90/Month | Social0",
    metaDescription:
      "Hootsuite Standard is $149/user/mo for 10 accounts. Social0 is $29.90/mo for 15 accounts, free to start, with API, MCP and CLI on every plan.",
    keywords: [
      "hootsuite alternative",
      "hootsuite vs social0",
      "social media management tool",
    ],
    heroHeadline: "A Hootsuite alternative without the enterprise overhead",
    heroSubheadline:
      "Schedule and publish across major platforms from one clean dashboard — built for speed, not boardrooms.",
    intro:
      "Hootsuite Standard is $149 per user per month ($99 billed yearly) for 10 social accounts, Professional $299 and Advanced $499; its developer API needs an application, its MCP connector is Enterprise-only, and its terms give no refund when you cancel or downgrade (hootsuite.com/plans and terms, checked 2026-11-19). Social0 Creator is $29.90/month for 15 accounts, Agency $59.90/month for 59 accounts plus $1 per extra, with the REST API, MCP server and CLI on every plan including Free.",
    whySwitch: [
      "Connect accounts and post in minutes",
      "Unified composer instead of stream-heavy tabs",
      "Scheduling calendar and drafts built in",
      "OAuth-only connections — we never store passwords",
      "Clear per-platform publish results",
    ],
    comparisonRows: [
      { feature: "Entry price", social0: "$29.90/mo for 15 accounts", competitor: "$149/user/mo for 10 accounts ($99 yearly)" },
      { feature: "Free plan", social0: "3 accounts, 10 posts, no card", competitor: "Not listed on the plans page; 14-day trial" },
      { feature: "API", social0: "Every plan, self-serve key", competitor: "Developer API; approval required" },
      { feature: "MCP server", social0: "Every plan", competitor: "Enterprise only" },
      { feature: "Listening, inbox, analytics suite", social0: "Basic analytics and inbox", competitor: "Full suite" },
      { feature: "Refund on cancel", social0: "Ask support", competitor: "No refund per Hootsuite's terms" },
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
    metaTitle: "Later Alternatives with a Free Plan, X and Bluesky | Social0",
    metaDescription:
      "Want a free Later alternative? Later has a 14-day trial and no X or Bluesky. Social0 is free for 3 accounts on 9 networks, or $29.90/mo for 15.",
    keywords: [
      "later alternatives",
      "later alternative",
      "free alternative to later",
      "similar to later",
      "alternatives to later for instagram planning",
      "later vs social0",
      "instagram scheduler",
    ],
    heroHeadline: "Later alternatives: when Social0 fits better, and when it doesn't",
    heroSubheadline:
      "Later is built for visual Instagram planning. Social0 is for people who post the same thing to many networks, including X and Bluesky, and want a free plan to start.",
    intro:
      "Later's plans group profiles into Social Sets of Instagram, Facebook, TikTok, Pinterest, LinkedIn, YouTube, Threads and Snapchat; X (Twitter) and Bluesky aren't in them. It starts with a 14-day trial, and Growth is $37.50/month billed yearly for 16 profiles with up to 180 posts per profile (later.com/pricing, checked 2026-11-17). Social0 has a free plan (3 accounts, 10 posts), and Creator is $29.90/month for 15 accounts with unlimited posts on all 9 networks, plus a REST API, MCP server and CLI.",
    whySwitch: [
      "You post to X or Bluesky as well as Instagram and TikTok",
      "You want a free plan instead of a 14-day trial",
      "You don't want a per-profile post limit",
      "You want ChatGPT, Claude or your own scripts to post for you (API, MCP, CLI on every plan)",
      "You publish one post to many networks at once and want to see which ones failed",
    ],
    comparisonRows: [
      {
        feature: "Free plan",
        social0: "Yes: 3 accounts, 10 posts",
        competitor: "14-day free trial",
      },
      {
        feature: "X (Twitter) and Bluesky",
        social0: "Yes",
        competitor: "Not in Later's Social Sets",
      },
      {
        feature: "Snapchat",
        social0: "No",
        competitor: "Yes",
      },
      {
        feature: "Mid-tier price",
        social0: "Creator: $29.90/mo, 15 accounts",
        competitor: "Growth: $37.50/mo billed yearly, 16 profiles",
      },
      {
        feature: "Post limits",
        social0: "Unlimited posts on paid plans",
        competitor: "Up to 180 posts per profile (Growth)",
      },
      {
        feature: "API, MCP and CLI for AI agents",
        social0: "Every plan",
        competitor: "Not listed on Later's pricing page",
      },
    ],
    faq: [
      {
        question: "Is there a free alternative to Later?",
        answer:
          "Social0 has a free plan with 3 connected accounts and 10 posts, no card needed. Later itself starts with a 14-day trial (checked 2026-11-17).",
      },
      {
        question: "Does Later support X (Twitter) and Bluesky?",
        answer:
          "Later's Social Sets cover Instagram, Facebook, TikTok, Pinterest, LinkedIn, YouTube, Threads and Snapchat; X and Bluesky aren't listed (later.com/pricing, checked 2026-11-17). Social0 supports both.",
      },
      {
        question: "When should I stay on Later?",
        answer:
          "Stay on Later if your work is mostly Instagram visual planning, you rely on its Link in Bio or UGC collection, or you post to Snapchat. Social0 doesn't do Snapchat or link-in-bio pages.",
      },
      {
        question: "Is there a Later alternative for Instagram grid planning?",
        answer:
          "Social0 has a content calendar for every network but no drag-and-drop Instagram grid preview, so if planning how your grid looks is the main job, Later or Planoly fit better. To split one image into 3, 6 or 9 grid tiles, Social0's free Instagram grid maker does it in your browser.",
      },
      {
        question: "Is Social0 better than Later for Instagram?",
        answer:
          "Both schedule Instagram posts. Choose Social0 when Instagram is one of several networks you post to and you want one dashboard, unlimited posts and API access for all of them.",
      },
    ],
    relatedFeatureSlugs: ["instagram-scheduler", "tiktok-scheduler"],
  },
  {
    slug: "metricool",
    competitorName: "Metricool",
    metaTitle: "Metricool Alternatives: Free X + LinkedIn, API on Every Plan | Social0",
    metaDescription:
      "Metricool's free plan skips X and LinkedIn and its API starts on Advanced. Social0: free plan with X, LinkedIn, API, MCP and CLI; unlimited posts on paid plans.",
    keywords: ["metricool alternative", "metricool alternatives", "metricool vs social0", "metricool pricing", "metricool free plan"],
    heroHeadline: "Metricool alternatives: when Social0 fits better",
    heroSubheadline:
      "Metricool is an analytics and ads-reporting suite with scheduling. Social0 is for people who mainly need to publish, on X and LinkedIn too, and want an API, MCP server and CLI for their AI agents.",
    intro:
      "Metricool's free plan covers 1 brand and 20 posts a month, but not LinkedIn or X. Paid plans are sold per brand (Starter for 5 or 10 brands, Advanced for 15 to 50), and the Metricool API (Zapier, Make) is listed only on Advanced and Custom. Its MCP is on every plan, and it adds Google Business Profile, Twitch and ads reporting (metricool.com/pricing, checked 2026-11-24). Social0's free plan includes X and LinkedIn plus the REST API, hosted MCP server and CLI, and paid plans have unlimited posts.",
    whySwitch: [
      "You want X and LinkedIn on a free plan",
      "You need an API without moving up to an Advanced plan",
      "Your AI assistant should publish for you through MCP (Claude, ChatGPT, Cursor) or a CLI",
      "You care about posting, not ads reporting",
    ],
    comparisonRows: [
      { feature: "Free plan", social0: "3 accounts, 10 posts, X and LinkedIn included", competitor: "1 brand, 20 posts/month, no X or LinkedIn" },
      { feature: "Paid pricing", social0: "Per account: Creator $29.90/mo for 15", competitor: "Per brand: Starter (5-10 brands), Advanced (15-50)" },
      { feature: "API", social0: "Every plan", competitor: "Advanced and Custom" },
      { feature: "MCP server", social0: "Every plan, plus a CLI", competitor: "Every plan" },
      { feature: "Ads reporting, Google Business Profile, Twitch", social0: "No", competitor: "Yes" },
    ],
    faq: [
      {
        question: "When is Metricool the better choice?",
        answer:
          "If you want analytics, competitor tracking and Facebook, Google and TikTok ads reporting in the same tool as scheduling, or you post to Google Business Profile or Twitch, Metricool covers more. Social0 does not try to replace a full analytics suite.",
      },
      {
        question: "Does Social0 have a free plan like Metricool?",
        answer:
          "Yes. Social0's free plan connects 3 accounts on any of its 9 networks, X and LinkedIn included, with 10 lifetime posts, and it includes the API, MCP server and CLI.",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "twitter-scheduler"],
  },
  {
    slug: "publer",
    competitorName: "Publer",
    metaTitle: "Publer Alternative With API and MCP on Every Plan | Social0",
    metaDescription:
      "Publer is $5-10 per account per month and keeps its API and MCP for Business. Social0: $29.90/mo for 15 accounts, API, MCP and CLI on every plan.",
    keywords: [
      "publer alternative",
      "publer vs social0",
      "social media scheduler",
    ],
    heroHeadline: "A Publer alternative with parallel publishing",
    heroSubheadline:
      "Publer covers many networks. Social0 focuses on one composer and simultaneous publishing to every account you select.",
    intro:
      "Publer charges per account: Professional is $5 per account per month ($4 yearly) and Business $10 ($8 yearly), every 10th account free; its API and MCP are on Business only, and the Free plan can't connect X (publer.com/plans, checked 2026-11-19). Social0 Creator is $29.90/month for 15 accounts, with the REST API, MCP server and CLI on every plan including Free, and X on every plan.",
    whySwitch: [
      "Parallel publish to all selected accounts at once",
      "No workspace complexity for solo creators",
      "Native Threads and Bluesky support",
      "Per-platform captions and validation",
      "Clear success / fail feedback per network",
    ],
    comparisonRows: [
      { feature: "15 accounts", social0: "$29.90/mo (Creator)", competitor: "About $70/mo on Professional or $140 on Business" },
      { feature: "API and MCP", social0: "Every plan, including Free", competitor: "Business plan only" },
      { feature: "X (Twitter) on the free plan", social0: "Yes", competitor: "No (paid plans only)" },
      { feature: "Post limits", social0: "Unlimited on paid plans", competitor: "Unlimited scheduling with daily limits" },
      { feature: "Networks", social0: "9", competitor: "Also Mastodon, Google Business, Telegram, WordPress" },
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

  {
    slug: "ayrshare",
    competitorName: "Ayrshare",
    metaTitle: "Ayrshare Alternative: Social Media API From $0 | Social0",
    metaDescription:
      "Ayrshare starts at $149/mo for one profile. Social0's REST API, MCP server and CLI are on every plan, free to start, then $29.90/mo for 15 accounts.",
    keywords: [
      "ayrshare alternative",
      "ayrshare alternatives",
      "ayrshare api alternatives",
      "ayrshare pricing",
      "social media posting api",
      "cheaper social media api",
    ],
    heroHeadline: "An Ayrshare alternative that doesn't start at $149",
    heroSubheadline:
      "Ayrshare is a capable posting API priced for businesses. Social0 gives the same publish-to-every-network API, plus an MCP server and CLI, from a free plan up.",
    intro:
      "Ayrshare's plans start at $149/month for 1 profile (Premium), then $299 for up to 10 profiles and $599 for 30; it has no free plan, and its only trial is 28 days on the $299 plan. It covers 14+ networks with a hosted MCP server and no per-post fees (ayrshare.com/pricing, checked 2026-11-19). Social0's REST API, hosted MCP server and CLI are on every plan, including a free plan (3 accounts, 10 posts, no card); Creator is $29.90/month for 15 accounts and Agency $59.90/month for 59 accounts plus $1 per extra, with unlimited posts.",
    whySwitch: [
      "You want to build and test against a posting API before paying (Social0's free plan includes the API, MCP and CLI)",
      "You manage a handful of brands, not hundreds: 15 accounts for $29.90/month vs $149+ to start",
      "You also want a dashboard and calendar for the humans on the team, not only an API",
      "Your agents run in Claude, ChatGPT or Cursor and need an MCP server plus a terminal CLI",
    ],
    comparisonRows: [
      { feature: "Starting price", social0: "Free; Creator $29.90/mo (15 accounts)", competitor: "Premium $149/mo (1 profile)" },
      { feature: "Free plan or trial", social0: "Free plan: 3 accounts, 10 posts, no card", competitor: "No free plan; 28-day trial on the $299 Launch plan" },
      { feature: "REST API", social0: "Every plan", competitor: "Every plan" },
      { feature: "MCP server", social0: "Hosted (OAuth) + npx package", competitor: "Hosted MCP server" },
      { feature: "CLI", social0: "Yes (npm social0)", competitor: "Not stated" },
      { feature: "Networks", social0: "9: X, LinkedIn, Instagram, TikTok, YouTube, Facebook Pages, Threads, Bluesky, Pinterest", competitor: "14+, incl. Reddit" },
      { feature: "Post limits", social0: "Unlimited on paid plans", competitor: "Unlimited; no per-post fees" },
      { feature: "When you cancel", social0: "Your posts stay in your account", competitor: "Posts and profile data are deleted (per Ayrshare docs)" },
    ],
    faq: [
      {
        question: "Is there a free alternative to Ayrshare?",
        answer:
          "Social0 has a free plan with the REST API, MCP server and CLI included: 3 connected accounts and 10 posts, no card. Ayrshare has no free plan; its 28-day trial is on the $299/month Launch plan (checked 2026-11-19).",
      },
      {
        question: "When is Ayrshare the better choice?",
        answer:
          "When you run a platform with hundreds of end-user profiles and need Reddit or other networks Social0 doesn't post to, Ayrshare's per-profile Business pricing and 14+ networks fit better.",
      },
      {
        question: "Can I move from Ayrshare to Social0 without rewriting everything?",
        answer:
          "The concepts match (connect accounts, then POST a post with text, media and target platforms), so most integrations port in an afternoon. Export anything you need from Ayrshare first: its docs say posts and profile data are deleted on cancellation.",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "twitter-scheduler"],
  },
  {
    slug: "postiz",
    competitorName: "Postiz",
    metaTitle: "Postiz Alternative With a Free Plan and API | Social0",
    metaDescription:
      "Postiz has no free plan and a 7-day trial; $29/mo gets 5 channels. Social0 is free to start, then $29.90/mo for 15 accounts, with API, MCP and CLI included.",
    keywords: ["postiz alternative", "postiz alternatives", "postiz pricing", "postiz vs social0", "open source scheduler alternative"],
    heroHeadline: "A Postiz alternative with three times the accounts per dollar",
    heroSubheadline:
      "Postiz is a solid scheduler with an open-source version. Social0 gives you more accounts at the entry price and a free plan to try the API before you pay.",
    intro:
      "Postiz Standard is $29/month for 5 channels ($39 for 10, $49 for 30, $99 for 100), with a 7-day trial and no free cloud plan. It includes its API, MCP server and CLI on every plan, but after you cancel, scheduled posts stay on the calendar without publishing (postiz.com/pricing and docs, checked 2026-11-19). Social0 Creator is $29.90/month for 15 accounts with unlimited posts, and its API, MCP server and CLI are on every plan including Free (3 accounts, 10 posts).",
    whySwitch: [
      "15 accounts for $29.90/month instead of 5 for $29",
      "A free plan to test the API, MCP and CLI with real accounts, not a 7-day clock",
      "Agency pricing that grows by $1 per extra account instead of jumping between tiers",
    ],
    comparisonRows: [
      { feature: "Entry plan", social0: "Creator $29.90/mo, 15 accounts", competitor: "Standard $29/mo, 5 channels" },
      { feature: "Free plan or trial", social0: "Free plan: 3 accounts, 10 posts", competitor: "7-day trial, no free cloud plan" },
      { feature: "API, MCP, CLI", social0: "Every plan, including Free", competitor: "Every paid plan" },
      { feature: "Self-hosting", social0: "Not offered", competitor: "Open-source version you can self-host" },
      { feature: "Networks", social0: "9 incl. Bluesky, Threads, Pinterest", competitor: "Also Reddit, Discord, Mastodon" },
      { feature: "Data export", social0: "Ask support", competitor: "No self-serve export (email support)" },
    ],
    faq: [
      {
        question: "When should I stay on Postiz?",
        answer:
          "If you want to self-host the open-source version, or you post to Reddit, Discord or Mastodon, which Social0 doesn't support.",
      },
      {
        question: "Is Social0 cheaper than Postiz?",
        answer:
          "Per account at the entry tier, yes: $29.90 for 15 accounts (about $2 each) vs $29 for 5 (about $5.80 each). At 100 channels Postiz Ultimate is $99; Social0 Agency is $59.90 for 59 plus $1 per extra, so $100.90 for 100 (prices checked 2026-11-19).",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "social-media-calendar"],
  },
  {
    slug: "postbridge",
    competitorName: "Post Bridge",
    metaTitle: "Post Bridge Alternative With a Free Plan | Social0",
    metaDescription:
      "Post Bridge is $39/mo for 15 accounts. Social0 is $29.90/mo for the same 15 accounts, with a free plan and API, MCP and CLI on every plan.",
    keywords: ["post bridge alternative", "post bridge alternatives", "postbridge alternative", "post bridge pricing", "best post bridge alternatives"],
    heroHeadline: "The Post Bridge alternative: same 15 accounts, $9 less",
    heroSubheadline:
      "Post Bridge and Social0 both post to the big networks with an API, MCP and CLI. Social0 starts free and costs less for the same account count.",
    intro:
      "Post Bridge's Marketer plan is $39/month for 15 accounts and Operator $99/month for 99, then $1 per account; it has a 7-day trial and no ongoing free plan (5 free posts), and includes API, MCP and CLI on current plans (post-bridge.com/pricing and help center, checked 2026-11-19). Social0 Creator is $29.90/month for 15 accounts and Agency $59.90/month for 59 accounts then $1 each, with a free plan of 3 accounts and 10 posts.",
    whySwitch: [
      "$29.90/month for 15 accounts instead of $39",
      "Agency: 59 accounts for $59.90 instead of a $99 minimum for 99",
      "A free plan you can keep, with the API, MCP and CLI included",
    ],
    comparisonRows: [
      { feature: "15 accounts", social0: "$29.90/mo", competitor: "$39/mo (Marketer)" },
      { feature: "Large plan", social0: "$59.90/mo for 59, then $1/account", competitor: "$99/mo for 99, then $1/account" },
      { feature: "Free plan", social0: "3 accounts, 10 posts, no card", competitor: "5 free posts; 7-day trial" },
      { feature: "API, MCP, CLI", social0: "Every plan, including Free", competitor: "Every current paid plan" },
      { feature: "Google Business Profile", social0: "No", competitor: "Yes" },
    ],
    faq: [
      {
        question: "When is Post Bridge the better choice?",
        answer:
          "If you post to Google Business Profile, or you already manage close to 99 accounts, where Operator's $99 lines up with Social0 Agency at 99 accounts ($99.90).",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "tiktok-scheduler"],
  },
  {
    slug: "blotato",
    competitorName: "Blotato",
    metaTitle: "Blotato Alternative With Unlimited Scheduled Posts | Social0",
    metaDescription:
      "Blotato caps queued posts (200 on Starter) and its trial needs a card and excludes the API. Social0: free plan with API and MCP, unlimited posts on paid plans.",
    keywords: ["blotato alternative", "blotato alternatives", "blotato free alternative", "blotato pricing", "blotato vs social0"],
    heroHeadline: "A Blotato alternative for publishing, without queue caps",
    heroSubheadline:
      "Blotato is strong at AI content creation. Social0 focuses on publishing: unlimited scheduled posts and an API you can try for free.",
    intro:
      "Blotato Starter is $29/month for 20 accounts with up to 200 queued posts (Creator $97 for 40 and 1,000; Agency $499 for 100 and 3,000). Its 7-day trial needs a card and excludes the API and MCP; generating an API key ends the trial and starts billing. It posts to the same 9 networks as Social0 and adds AI image and video generation (blotato.com/pricing and help center, checked 2026-11-19). Social0 has no AI generation, but its paid plans have unlimited posts and its free plan includes the API, MCP server and CLI.",
    whySwitch: [
      "No cap on how many posts you can have scheduled",
      "Test the API and MCP on a free plan instead of a card-required trial that excludes them",
      "At agency scale: 59 accounts for $59.90/month vs 100 for $499",
    ],
    comparisonRows: [
      { feature: "Entry plan", social0: "Creator $29.90/mo, 15 accounts", competitor: "Starter $29/mo, 20 accounts" },
      { feature: "Scheduled post cap", social0: "Unlimited on paid plans", competitor: "200 / 1,000 / 3,000 queued by plan" },
      { feature: "Trial", social0: "Free plan, no card", competitor: "7-day trial, card required, API/MCP excluded" },
      { feature: "AI image and video generation", social0: "No", competitor: "Yes (credits)" },
      { feature: "Networks", social0: "Same 9", competitor: "Same 9" },
    ],
    faq: [
      {
        question: "When should I pick Blotato?",
        answer:
          "When you want AI to create the images and videos, not just publish them. Social0 publishes what you or your agents make; it doesn't generate media.",
      },
    ],
    relatedFeatureSlugs: ["multi-platform-scheduler", "instagram-scheduler"],
  },
  {
    slug: "postflow",
    competitorName: "PostFlow",
    metaTitle: "PostFlow Alternatives: Unlimited X Posts + MCP | Social0",
    metaDescription:
      "PostFlow starts at $12/mo but charges credits past a few X posts a day. Social0: free plan, API and MCP included, unlimited posts on paid plans.",
    keywords: ["the post flow alternatives", "postflow alternative", "postflow alternatives", "postflow pricing", "postflow.app"],
    heroHeadline: "PostFlow alternatives: when Social0 fits better",
    heroSubheadline:
      "PostFlow (postflow.app) is a low-cost scheduler. Social0 is for people who post a lot to X or want an MCP server and CLI for their AI agents.",
    intro:
      "PostFlow is $12/month for 8 accounts (Brand $27 for 24, Business $57 for 50, Agency $97 for 100) with a 7-day trial and no card. X posts beyond a daily allowance (10 on Solo) cost credits, and X posts with links always cost credits. It has API docs; an MCP server or CLI isn't mentioned (postflow.app/pricing and docs, checked 2026-11-19). Social0 has unlimited posts on paid plans, including X, and its REST API, hosted MCP server and CLI are on every plan.",
    whySwitch: [
      "You post to X often, or with links, and don't want per-post credits",
      "Your AI assistant should publish for you through MCP (Claude, ChatGPT, Cursor) or a CLI",
      "You want a free plan to try it with your own accounts",
    ],
    comparisonRows: [
      { feature: "Entry price", social0: "Free; Creator $29.90/mo for 15", competitor: "$12/mo for 8 accounts" },
      { feature: "X posts", social0: "Unlimited on paid plans", competitor: "Daily allowance, then credits; links always cost credits" },
      { feature: "API", social0: "Every plan", competitor: "API docs exist; plan terms not stated" },
      { feature: "MCP server and CLI", social0: "Yes", competitor: "Not stated" },
      { feature: "Google Business Profile, Dribbble", social0: "No", competitor: "Yes" },
    ],
    faq: [
      {
        question: "When is PostFlow the better choice?",
        answer:
          "If you post a few times a week to a handful of accounts and want the lowest monthly price, PostFlow's $12 Solo plan is cheaper. It also covers Google Business Profile and Dribbble.",
      },
    ],
    relatedFeatureSlugs: ["twitter-scheduler", "multi-platform-scheduler"],
  },
  {
    slug: "planoly",
    competitorName: "Planoly",
    metaTitle: "Planoly Alternatives: 15 Accounts for $29.90, API + MCP | Social0",
    metaDescription:
      "Planoly is $14/mo for 1 social set and adds $8-10 per extra set. Social0: free plan, 15 accounts for $29.90/mo, unlimited posts, API, MCP and CLI on every plan.",
    keywords: ["planoly alternative", "planoly alternatives", "planoly vs social0", "planoly pricing", "apps like planoly"],
    heroHeadline: "Planoly alternatives: when Social0 fits better",
    heroSubheadline:
      "Planoly is an Instagram-first visual planner. Social0 is for people who post to many accounts and networks, or want their AI agents to publish for them.",
    intro:
      "Planoly is $14/month for 1 social set and 1 user, $24 for 2 sets and $47 for 6, with extra sets at $10 (Growth) or $8 (Pro) a month and a 14-day trial; its free plan is mobile-only with 10 uploads a month. It covers Instagram, Facebook, X, Pinterest, LinkedIn, YouTube, Threads and TikTok, with a grid planner, link in bio and digital product sales (planoly.com/pricing, checked 2026-11-24). Social0 adds Bluesky, gives 15 accounts for $29.90/month with unlimited posts, and includes a REST API, hosted MCP server and CLI on every plan.",
    whySwitch: [
      "You manage more accounts than a few social sets cover",
      "You post to Bluesky as well as the big networks",
      "Your AI assistant should publish for you through MCP (Claude, ChatGPT, Cursor) or a CLI",
      "You want a free plan on the web, not only in a mobile app",
    ],
    comparisonRows: [
      { feature: "Entry price", social0: "Free; Creator $29.90/mo for 15 accounts", competitor: "$14/mo for 1 social set" },
      { feature: "Growing", social0: "Agency $59.90/mo for 59 accounts, then $1 each", competitor: "$8-10/mo per extra social set" },
      { feature: "Free plan", social0: "Web and API, 3 accounts, 10 posts", competitor: "Mobile app only, 10 uploads/month" },
      { feature: "API, MCP server and CLI", social0: "Every plan", competitor: "Planoly MCP exists; plan not stated on pricing page" },
      { feature: "Instagram grid planner, link in bio, digital products", social0: "No", competitor: "Yes" },
    ],
    faq: [
      {
        question: "When is Planoly the better choice?",
        answer:
          "If you run one Instagram-led brand and want visual grid planning, a link-in-bio page and selling digital products in one place, Planoly's $14 Starter plan fits that well.",
      },
    ],
    relatedFeatureSlugs: ["instagram-scheduler", "multi-platform-scheduler"],
  },
  ...CATALOG_ALTERNATIVES,
];

export const ALTERNATIVES: AlternativePage[] = ALL_ALTERNATIVES.filter(
  (page, index) => ALL_ALTERNATIVES.findIndex((other) => other.slug === page.slug) === index,
);

export const ALTERNATIVE_SLUGS = ALTERNATIVES.map((a) => a.slug);

export function getAlternative(slug: string): AlternativePage | undefined {
  return ALTERNATIVES.find((a) => a.slug === slug);
}
