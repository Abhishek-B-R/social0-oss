import type { BlogPost } from "../blog-types";

export const instagramAlgorithmGuide: BlogPost = {
  slug: "instagram-algorithm-guide",
  category: "Strategy",
  metaTitle: "How the Instagram Algorithm Works in 2026 (Feed, Reels, Explore)",
  metaDescription:
    "Instagram runs four different algorithms, not one. What Feed, Reels, Stories, and Explore each rank on, why sends beat likes, and the repost rule that can remove you from recommendations.",
  keywords: [
    "instagram algorithm",
    "how instagram algorithm works",
    "instagram reels algorithm",
    "instagram reach 2026",
    "instagram explore algorithm",
    "instagram sends ranking signal",
  ],
  title: "How the Instagram algorithm works in 2026",
  excerpt:
    "There isn't one Instagram algorithm — there are four, and they rank on different things. Here's what each surface rewards, why a DM share is worth more than a like, and the reposting rule that quietly kills accounts.",
  datePublished: "2026-09-20",
  readingMinutes: 10,
  body: [
    {
      type: "paragraph",
      text: "The most common mistake in Instagram advice is talking about “the algorithm” as one system. Instagram runs separate ranking systems for **Feed, Reels, Stories, and Explore**, and they weight signals differently. Content that thrives in Explore can do nothing in Feed, and the reason is structural rather than mysterious.",
    },
    {
      type: "heading",
      text: "Four surfaces, four sets of priorities",
    },
    {
      type: "table",
      columns: ["Surface", "Ranks mainly on", "What that means for you"],
      rows: [
        [
          "Feed",
          "Relationship strength, then interest",
          "Reaches people who already interact with you. Good for conversion, poor for growth.",
        ],
        [
          "Reels",
          "Watch time and sends",
          "The growth surface. Followers matter far less than whether the video holds and travels.",
        ],
        [
          "Stories",
          "Recency and viewing history",
          "Almost purely your existing audience. A retention and relationship surface.",
        ],
        [
          "Explore",
          "Engagement velocity and interest match",
          "Pure discovery. Fast early engagement is what gets you in.",
        ],
      ],
    },
    {
      type: "callout",
      title: "The practical consequence",
      text: "If your goal is **reach**, you are making Reels. If your goal is **converting people who already follow you**, you are posting to Feed and Stories. Judging a Feed post by its reach, or a Story by its like count, is measuring the wrong thing.",
    },
    {
      type: "heading",
      text: "The three signals Instagram has actually named",
    },
    {
      type: "paragraph",
      text: "Adam Mosseri has repeatedly pointed at three, and they are worth taking literally because they are unusually specific:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Watch time** — how long people stay with your content.",
        "**Sends per reach** — how often someone forwards it in a DM, relative to how many saw it.",
        "**Likes per reach** — the weakest of the three, and the one everyone optimises for.",
      ],
    },
    {
      type: "paragraph",
      text: "Note the *per reach* construction on two of them. These are **rates, not totals**. A post seen by 500 people with 50 sends outranks one seen by 50,000 with 200 sends. This is why small accounts can still break out, and why buying reach does not help.",
    },
    {
      type: "heading",
      text: "Sends are the whole game",
    },
    {
      type: "paragraph",
      text: "If you optimise for one thing on Instagram in 2026, make it **sends** — someone forwarding your post to a specific person in a DM. It is the most heavily weighted distribution signal for Reels, and it is qualitatively different from a like.",
    },
    {
      type: "paragraph",
      text: "A like is a reflex. A send requires someone to think of a particular person and decide this is worth their attention. That is a much stronger relevance signal, and Instagram treats it accordingly.",
    },
    {
      type: "paragraph",
      text: "Content people actually send:",
    },
    {
      type: "list",
      items: [
        "**“This is so you.”** Content that describes a recognisable person or situation.",
        "**Genuinely useful and specific.** A method, a spec, a fix worth passing to a colleague.",
        "**Funny in a targeted way.** Broad humour gets liked; niche humour gets sent.",
        "**Something to react to together.** A take someone wants a friend's opinion on.",
      ],
    },
    {
      type: "paragraph",
      text: "What does not get sent: generic motivation, company announcements, and anything that reads as an ad. These can still get likes, which is why like-count optimisation quietly misleads you.",
    },
    {
      type: "heading",
      text: "The repost rule",
    },
    {
      type: "callout",
      title: "This one removes accounts from recommendations",
      text: "Original content receives substantially more distribution than reposted content — figures around **40–60% more** are widely reported. More seriously, accounts posting roughly **10 or more reposts within 30 days can be excluded from recommendations entirely.** Not down-ranked. Excluded.",
    },
    {
      type: "paragraph",
      text: "This is the single most dangerous thing in this guide for anyone running an aggregator, a meme page, or a brand account that leans on user-generated content. The threshold is low enough to hit by accident.",
    },
    {
      type: "paragraph",
      text: "What counts against you is reposting other people's content as your own. What is fine: your own content, genuine collaborations, and properly credited UGC where you have added something. If reposting is core to your account, the honest answer is that Instagram has decided against that model.",
    },
    {
      type: "paragraph",
      text: "This also has a cross-posting implication. A video downloaded from TikTok with a visible watermark reads as unoriginal to exactly this system — which is the mechanism behind the watermark penalty covered in [cross-posting vs repurposing](/blog/cross-posting-vs-repurposing).",
    },
    {
      type: "heading",
      text: "What changed recently",
    },
    {
      type: "list",
      items: [
        "**Hashtags capped at five.** Down from thirty, since December 2025, and enforced at publish time. Covered in full in [Instagram's 5-hashtag limit](/blog/instagram-hashtag-limit).",
        "**Longer Reels are being recommended more.** Instagram has been pushing longer storytelling into Explore, softening the old assumption that shorter always wins.",
        "**Automatic caption and audio translation.** Reels now reach international audiences without you doing anything, which makes clear, plainly-worded captions more valuable.",
        "**Search matters more.** Instagram matches queries against captions, bios, and usernames. Writing captions in the words people actually type is now a real discovery lever — arguably more than hashtags.",
      ],
    },
    {
      type: "heading",
      text: "The soft limits worth knowing",
    },
    {
      type: "table",
      columns: ["Threshold", "What happens"],
      rows: [
        [
          "Reels over ~3 minutes",
          "Accepted, but Instagram stops pushing them to non-followers. Treat 3 min as the real ceiling.",
        ],
        [
          "More than 5 hashtags",
          "Blocked or stripped at publish time.",
        ],
        [
          "~10+ reposts in 30 days",
          "Risk of exclusion from recommendations.",
        ],
        [
          "25 API posts per rolling 24h",
          "Publishing limit per account. See [Instagram API rate limits](/blog/instagram-api-rate-limits).",
        ],
      ],
    },
    {
      type: "cta",
      text: "Schedule Reels, carousels, and Stories alongside your other networks.",
      href: "/features/instagram-scheduler",
      label: "See the Instagram scheduler",
    },
    {
      type: "heading",
      text: "A working approach",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Make Reels for reach, carousels for saves, Stories for retention.** Match the format to the surface you need.",
        "**Write the first line for a send, not a like.** Ask who the viewer would forward this to.",
        "**Keep Reels under 3 minutes**, and open with something that earns the next two seconds.",
        "**Post original content.** If you must repost, keep it well under the threshold and add something real.",
        "**Write captions in plain search language**, then five deliberate hashtags.",
        "**Check sends and saves, not likes.** They are in the post insights and they are what the ranking actually uses.",
      ],
    },
    {
      type: "paragraph",
      text: "The theme across all four surfaces is that Instagram has moved from measuring approval to measuring attention and transmission. Likes are cheap and the system knows it.",
    },
  ],
  faq: [
    {
      question: "How does the Instagram algorithm work in 2026?",
      answer:
        "Instagram runs separate ranking systems for Feed, Reels, Stories, and Explore. Feed ranks mainly on relationship strength, Reels on watch time and sends, Stories on recency, and Explore on engagement velocity. The three signals Instagram has named directly are watch time, sends per reach, and likes per reach.",
    },
    {
      question: "What is the most important Instagram ranking signal?",
      answer:
        "Sends — someone forwarding your post to a specific person in a DM. It is the most heavily weighted distribution signal for Reels because it requires real intent, unlike a like. Watch time is a close second, and likes are the weakest of the three.",
    },
    {
      question: "Does reposting content hurt your Instagram reach?",
      answer:
        "Yes, significantly. Original content receives substantially more distribution, and accounts posting roughly ten or more reposts within thirty days can be excluded from recommendations entirely. This also covers videos carrying another platform's watermark.",
    },
    {
      question: "How long should Instagram Reels be?",
      answer:
        "Under three minutes. The API accepts up to twenty minutes, but past roughly three Instagram stops recommending the Reel to non-followers — it publishes fine and existing followers see it, but it is excluded from discovery. Instagram has recently been recommending longer storytelling Reels more, but three minutes remains the practical ceiling.",
    },
    {
      question: "Do likes still matter on Instagram?",
      answer:
        "They count, but they are the weakest of the three named signals and they are measured as likes per reach rather than a total. Optimising for likes tends to produce broadly agreeable content that nobody forwards, which is exactly what the current ranking discounts.",
    },
  ],
  relatedPaths: [
    { href: "/features/instagram-scheduler", label: "Instagram scheduler" },
    { href: "/features/multi-platform-scheduler", label: "Multi-platform scheduler" },
  ],
  relatedSlugs: [
    "instagram-hashtag-limit",
    "reels-vs-tiktok-vs-shorts",
    "tiktok-algorithm-guide",
  ],
};
