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
  /** Platform-specific options available in the composer before publish. */
  prePostOptions?: { title: string; description: string }[];
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
      "Schedule Threads posts with per-platform captions, text, images, video, and multi-post threads. Publish now, queue, or save a Social0 draft.",
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
      "Threads shares Meta's ecosystem but deserves its own publishing workflow. Social0 connects via official OAuth, enforces caption and media limits, lets you override the caption just for Threads, and schedules posts on the same calendar as every other network.",
    benefits: [
      {
        title: "Official Threads OAuth",
        description:
          "Connect securely with Meta's Threads API. Tokens are encrypted at rest and refreshed before they expire.",
      },
      {
        title: "Text, images, video, and threads",
        description:
          "Publish single posts or thread-style multi-post drafts without re-uploading in a separate app.",
      },
      {
        title: "Schedule, post now, or draft",
        description:
          "Queue Threads for later, publish with your other networks in one action, or save work in Social0 drafts.",
      },
      {
        title: "Multiple Threads accounts",
        description:
          "Manage more than one profile when your plan allows multiple connections per platform.",
      },
    ],
    prePostOptions: [
      {
        title: "Per-platform caption",
        description:
          "Keep one base caption, then override the Threads copy so hashtags and length match the network.",
      },
      {
        title: "Text, image, and video",
        description:
          "Attach the media types Threads accepts from the same composer you use for X and Instagram.",
      },
      {
        title: "Multi-post threads",
        description:
          "Build a thread in Social0 instead of chaining replies by hand in the Threads app.",
      },
      {
        title: "When it goes out",
        description:
          "Post now, pick a time, drop it in your posting queue, or save a Social0 draft to finish later.",
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
          "Write a caption (or a Threads-only override), attach media, and optionally split it into a thread.",
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
      "Schedule Bluesky posts with character limits, images, threads, and per-platform captions. Connect with your handle and app password.",
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
      "Bluesky uses a bring-your-own-key connection instead of classic OAuth. Social0 lets you connect your handle, compose within Bluesky's limits, override the caption for AT Protocol only, and schedule like any other platform. App-password permissions stay in Bluesky settings.",
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
          "Queue posts for peak hours, publish immediately, or save a Social0 draft.",
      },
    ],
    prePostOptions: [
      {
        title: "Per-platform caption",
        description:
          "Override the Bluesky text independently so skeets stay within the character limit.",
      },
      {
        title: "Images and threads",
        description:
          "Attach supported images or publish a multi-post thread from the same create flow.",
      },
      {
        title: "App password, not extra OAuth toggles",
        description:
          "What Social0 can do is whatever you allowed when you created the Bluesky app password.",
      },
      {
        title: "When it goes out",
        description:
          "Post now, schedule a time, use a queue slot, or keep it as a Social0 draft.",
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
        description:
          "Write text, attach images Bluesky accepts, and optionally override the Bluesky-only caption.",
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
      "TikTok scheduler for videos and photo posts. Set title, privacy, comments, Duet, Stitch, branded disclosure, or send as a TikTok draft.",
    keywords: [
      "tiktok scheduler",
      "schedule tiktok posts",
      "tiktok content scheduler",
    ],
    heroHeadline: "TikTok scheduler with Direct Post support",
    heroSubheadline:
      "Upload video or images, configure TikTok-specific settings, and schedule from the same composer you use for every network.",
    intro:
      "TikTok publishing has extra requirements - titles, privacy, interaction toggles, and commercial labels. Social0's TikTok panel captures those settings, can send the post to TikTok as a draft instead of going live, processes photo formats when needed, and schedules through TikTok's Content Posting API.",
    benefits: [
      {
        title: "Video and photo posts",
        description:
          "Publish short videos and supported photo carousels. PNGs for photo posts are converted to JPEG automatically.",
      },
      {
        title: "Full TikTok composer settings",
        description:
          "Title, privacy, comments, Duet, Stitch, commercial disclosure, and send-as-draft live next to the upload.",
      },
      {
        title: "Scheduling built in",
        description:
          "Queue TikTok content for later alongside Instagram Reels and YouTube Shorts, or post immediately.",
      },
    ],
    prePostOptions: [
      {
        title: "TikTok title",
        description:
          "Optional unique title (up to 85 characters) separate from your caption.",
      },
      {
        title: "Send to TikTok as draft",
        description:
          "Save the post in TikTok instead of publishing. Finish and go live from TikTok inbox notifications.",
      },
      {
        title: "Privacy",
        description:
          "Public, Friends, Followers, or Only me. Branded content cannot use Only me.",
      },
      {
        title: "Comments, Duet, and Stitch",
        description:
          "Allow or block comments. On videos, also control whether others can Duet or Stitch.",
      },
      {
        title: "Commercial content disclosure",
        description:
          "Label Your Brand (promotional) or Branded Content (paid partnership) before publish.",
      },
      {
        title: "Per-platform caption",
        description:
          "Override the TikTok caption independently from the copy you send to other networks.",
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
          "Add media, set title, privacy, interaction toggles, disclosure, or send as a TikTok draft.",
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
      {
        question: "Can I send a post to TikTok as a draft?",
        answer:
          "Yes. Turn on Send to TikTok as Draft in TikTok settings. Social0 delivers the media to TikTok; you finish editing and publish from TikTok (check inbox notifications). That is separate from saving a Social0 draft in your dashboard.",
      },
      {
        question: "Which TikTok privacy and disclosure options can I set?",
        answer:
          "Privacy: Public, Friends, Followers, or Only me. You can allow or disable comments, and on videos Duet and Stitch. Commercial disclosure covers Your Brand and Branded Content (paid partnership).",
      },
    ],
    relatedAlternativeSlugs: ["later", "buffer"],
  },
  {
    slug: "instagram-scheduler",
    platformLabel: "Instagram",
    metaTitle: "Instagram Scheduler - Schedule Posts & Reels | Social0",
    metaDescription:
      "Instagram scheduler for feed posts, carousels, and Reels. Set a custom Reel cover, trial Reel, and per-platform captions in Social0.",
    keywords: [
      "instagram scheduler",
      "schedule instagram posts",
      "instagram reel scheduler",
    ],
    heroHeadline: "Instagram scheduler without leaving your main workflow",
    heroSubheadline:
      "Connect Instagram directly or via a linked Facebook Page, then schedule posts with the rest of your content calendar.",
    intro:
      "Instagram publishing often means jumping between Meta Business tools. Social0 supports direct Instagram OAuth and Facebook Page-linked accounts, then exposes Reel cover and trial-Reel options in the composer so you set those before publish, not in a second app.",
    benefits: [
      {
        title: "Two connection paths",
        description:
          "Connect Instagram directly or through a Facebook Page when that fits your setup.",
      },
      {
        title: "Carousel and Reel support",
        description:
          "Publish feed images, carousels, and Reels from one upload flow with Instagram limits in the UI.",
      },
      {
        title: "Reel-specific options",
        description:
          "Upload a custom 9:16 cover and optionally publish as a trial Reel to non-followers first.",
      },
    ],
    prePostOptions: [
      {
        title: "Custom Reel cover",
        description:
          "Upload a JPEG cover (9:16 / 1080×1920 recommended, under 8MB) instead of a video frame.",
      },
      {
        title: "Trial Reel",
        description:
          "Test the Reel with non-followers before sharing it with everyone.",
      },
      {
        title: "Carousels and feed images",
        description:
          "Reorder images, keep Instagram's attachment limits, and publish alongside other networks.",
      },
      {
        title: "Per-platform caption",
        description:
          "Override Instagram copy independently of the caption you send to TikTok or LinkedIn.",
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
          "Add images or video, set a Reel cover or trial Reel when needed, and write a caption with limit indicators.",
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
      {
        question: "Can I set a custom cover or trial Reel?",
        answer:
          "Yes, in Instagram Config on the video form: upload a cover image and toggle Trial Reel to test with non-followers first.",
      },
    ],
    relatedAlternativeSlugs: ["later", "buffer"],
  },
  {
    slug: "linkedin-scheduler",
    platformLabel: "LinkedIn",
    metaTitle: "LinkedIn Scheduler - Schedule Posts & Articles | Social0",
    metaDescription:
      "LinkedIn scheduler for text, images (up to 20), and video. Post to connected profiles or pages with per-platform captions from Social0.",
    keywords: [
      "linkedin scheduler",
      "schedule linkedin posts",
      "linkedin post scheduler",
    ],
    heroHeadline: "LinkedIn scheduler for founders and operators",
    heroSubheadline:
      "Draft thought leadership once, schedule it, and publish to LinkedIn with your other channels.",
    intro:
      "LinkedIn rewards consistency. Social0 connects via official OAuth, supports text, images, and video, lets you override the LinkedIn caption, and posts to the personal profile or company page you connected - on the same calendar as X and Threads.",
    benefits: [
      {
        title: "Professional publishing",
        description:
          "Post text, images (up to 20 attachments), and video with LinkedIn's limits enforced in the UI.",
      },
      {
        title: "Profile or company page",
        description:
          "Publish to the LinkedIn accounts available through your OAuth scopes - personal and pages you selected at connect.",
      },
      {
        title: "Token refresh",
        description:
          "Expired tokens are refreshed automatically before publish when possible.",
      },
    ],
    prePostOptions: [
      {
        title: "Which LinkedIn account",
        description:
          "Pick the connected profile or company page in the composer. Extra pages are added from Connections.",
      },
      {
        title: "Per-platform caption",
        description:
          "Write thought-leadership copy for LinkedIn without changing the tweet or Reel caption.",
      },
      {
        title: "Media mix",
        description:
          "Text-only, images (first 20 if you attach more), or video, with character guidance in the editor.",
      },
      {
        title: "When it goes out",
        description:
          "Queue for business hours, publish immediately, use a posting-queue slot, or save a Social0 draft.",
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
        description:
          "Compose with character guidance and an optional LinkedIn-only caption override.",
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
      "X and Twitter scheduler with Premium limits, threads, media, Made with AI and paid-partnership labels, plus per-platform captions.",
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
      "X publishing needs OAuth 1.0a and careful character limits - 280 for standard accounts, up to 25,000 for Premium. Social0 detects Premium, supports tweets and threads, and lets you mark Made with AI or a paid partnership before the post goes out.",
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
        title: "X post labels",
        description:
          "Toggle Made with AI and Paid partnership so the disclosure is on the tweet, not an afterthought.",
      },
    ],
    prePostOptions: [
      {
        title: "Made with AI",
        description:
          "Add X's AI disclosure label for this post from X Settings in the composer.",
      },
      {
        title: "Paid partnership",
        description:
          "Mark the post as a branded or paid partnership on X.",
      },
      {
        title: "Tweets, threads, and media",
        description:
          "Single posts or threads with images and video, using the live character count for that account.",
      },
      {
        title: "Per-platform caption",
        description:
          "Keep a short tweet while LinkedIn or Instagram gets a longer override.",
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
        description:
          "Write a tweet or thread with live character counts, then set AI or paid-partnership labels if needed.",
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
      {
        question: "Can I label a tweet as AI-generated or a paid partnership?",
        answer:
          "Yes. X Settings in the composer includes Made with AI and Paid partnership toggles for that post.",
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
      {
        title: "Per-network options",
        description:
          "Selecting TikTok, Pinterest, YouTube, Instagram, or X unlocks that platform's settings instead of a generic one-size post.",
      },
    ],
    prePostOptions: [
      {
        title: "Per-platform captions",
        description:
          "One base caption, optional override per network so hashtags and length match each API.",
      },
      {
        title: "Platform config panels",
        description:
          "TikTok (privacy, draft, Duet, disclosure), Pinterest (board, title, link), YouTube title, Instagram cover and trial Reel, X AI and partnership labels.",
      },
      {
        title: "Account mix",
        description:
          "Select any combination of connected accounts. One failure does not block the rest.",
      },
      {
        title: "When it goes out",
        description:
          "Post now with live progress, one schedule time for all, a queue slot, or a Social0 draft.",
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
        title: "Compose once, then tune each network",
        description:
          "Write a shared caption, then open per-platform captions and option panels (TikTok, Pinterest, YouTube title, Instagram Reel, X labels) for the accounts you selected.",
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
      "YouTube scheduler for Shorts and videos. Set a custom title (caption becomes the description) and schedule from Social0.",
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
      "YouTube publishing usually means opening Studio. Social0 connects via Google OAuth, lets you set a YouTube title in the composer (the caption is the description), tags vertical videos under 3 minutes as Shorts, and schedules them on the same calendar as Reels and TikTok.",
    benefits: [
      {
        title: "Google OAuth connection",
        description:
          "Connect your YouTube channel securely. Tokens are encrypted and refreshed automatically.",
      },
      {
        title: "Shorts and video support",
        description:
          "Vertical video up to 3 minutes is published as a Short (with #Shorts). Longer or landscape uploads go out as regular videos (up to 5 minutes in this flow).",
      },
      {
        title: "Custom title",
        description:
          "Set a YouTube title (up to 100 characters). If you skip it, Social0 uses the caption.",
      },
    ],
    prePostOptions: [
      {
        title: "YouTube title",
        description:
          "Optional title field in the composer. Shorts also get #Shorts appended when needed.",
      },
      {
        title: "Description from caption",
        description:
          "Your post caption (or YouTube-only override) is used as the video description.",
      },
      {
        title: "Shorts vs long-form",
        description:
          "Social0 classifies Shorts from duration and aspect ratio. You do not pick a separate YouTube product in the form.",
      },
      {
        title: "When it goes out",
        description:
          "Schedule or publish now. Videos are uploaded as public through this flow.",
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
        description:
          "Add your video, set an optional YouTube title, and use the caption as the description.",
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
          "Social0 handles scheduling and publishing. Advanced Studio features like end screens, playlists, and visibility other than public remain in YouTube Studio.",
      },
      {
        question: "Can I set a custom YouTube title?",
        answer:
          "Yes. YouTube Title in the composer accepts up to 100 characters. The post caption is used as the description.",
      },
    ],
    relatedAlternativeSlugs: ["buffer", "metricool"],
  },
  {
    slug: "pinterest-scheduler",
    platformLabel: "Pinterest",
    metaTitle: "Pinterest Scheduler - Schedule Pins & Idea Pins | Social0",
    metaDescription:
      "Pinterest scheduler with board picker, optional pin title and destination link, plus image and video pins from Social0.",
    keywords: [
      "pinterest scheduler",
      "schedule pinterest pins",
      "pinterest pin scheduler",
    ],
    heroHeadline: "Pinterest scheduler with board selection",
    heroSubheadline:
      "Pick your board, add your pin, and schedule alongside Instagram and TikTok.",
    intro:
      "Pinterest needs the right board and pin fields. Social0 connects via OAuth, lets you pick or create a public board, set an optional title and destination link, remember those per account, and schedule pins on the same calendar as every other network.",
    benefits: [
      {
        title: "Board picker",
        description:
          "Choose which public board each pin lands on, create a board from the composer, and remember a default.",
      },
      {
        title: "Title and destination link",
        description:
          "Optional pin title (100 characters) and a click-through URL, with remember-link per account.",
      },
      {
        title: "Image and video pins",
        description:
          "Publish supported pin formats with per-platform validation.",
      },
    ],
    prePostOptions: [
      {
        title: "Board (required)",
        description:
          "Select a public board. Only public boards can receive pins from this app.",
      },
      {
        title: "Create a board",
        description:
          "Add a new public board from the composer without leaving Social0.",
      },
      {
        title: "Pin title",
        description:
          "Optional title. If empty, Social0 uses the first 100 characters of the caption.",
      },
      {
        title: "Destination link",
        description:
          "Optional URL viewers can open from the pin. Remember board and link per Pinterest account.",
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
          "Upload your pin image or video, pick or create a board, and optionally set title and link.",
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
          "Each publish targets the board you select in the composer for that post. You can remember a default board per account.",
      },
      {
        question: "Can I set a pin title and destination link?",
        answer:
          "Yes. Pinterest Config includes an optional title (max 100 characters) and an optional link, with remember checkboxes per account.",
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
      "Facebook Page publishing requires Meta permissions and the right account type. Social0 connects Pages via official OAuth, supports text, images (up to 20), and video, lets you override the Facebook caption, and schedules them on your unified calendar.",
    benefits: [
      {
        title: "Page-only publishing",
        description:
          "Built for Facebook Pages - the format businesses and creators actually use.",
      },
      {
        title: "Multi-photo and video",
        description:
          "Publish image carousels (up to 20 images) and video posts supported by the Graph API.",
      },
      {
        title: "Works with Instagram",
        description:
          "Select both accounts in the composer and publish or schedule in one action.",
      },
    ],
    prePostOptions: [
      {
        title: "Which Page",
        description:
          "Authorize Meta OAuth and pick the Facebook Page in Connections, then select it in the composer.",
      },
      {
        title: "Per-platform caption",
        description:
          "Override Facebook copy independently of Instagram or LinkedIn.",
      },
      {
        title: "Text, images, and video",
        description:
          "If you attach more than 20 images, only the first 20 go to Facebook.",
      },
      {
        title: "When it goes out",
        description:
          "Schedule, post now, use a queue slot, or save a Social0 draft.",
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
        description: "Write your post, attach images or video, and optionally override the Facebook caption.",
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
