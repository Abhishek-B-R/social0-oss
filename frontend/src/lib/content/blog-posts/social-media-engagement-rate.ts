import type { BlogPost } from "../blog-types";

export const socialMediaEngagementRate: BlogPost = {
  slug: "social-media-engagement-rate",
  category: "Strategy",
  metaTitle: "Engagement Rate: Formulas, Benchmarks, and What to Actually Track",
  metaDescription:
    "The three engagement rate formulas, why they give wildly different numbers, 2026 benchmarks by platform, and how to pick one and report it consistently.",
  keywords: [
    "engagement rate formula",
    "how to calculate engagement rate",
    "social media engagement rate benchmarks",
    "good engagement rate social media",
    "social media metrics that matter",
  ],
  title: "Engagement rate: formulas, benchmarks, and what to actually track",
  excerpt:
    "Three different formulas, all called “engagement rate”, all giving different answers for the same post. Here is how each one works, which to pick, and what a good number looks like per platform.",
  datePublished: "2026-09-20",
  readingMinutes: 9,
  body: [
    {
      type: "paragraph",
      text: "Engagement rate is the most quoted metric in social media and the least consistently defined. Two tools can report the same post as 1.2% and 6.5% and both be correct, because they are dividing by different things.",
    },
    {
      type: "paragraph",
      text: "That matters when you are comparing yourself to a benchmark, or to last quarter, or to a competitor. Most of the time the comparison is meaningless because the denominators differ.",
    },
    {
      type: "heading",
      text: "The three formulas",
    },
    {
      type: "table",
      caption:
        "All three are legitimate. They answer different questions, and they are not comparable to each other.",
      columns: ["Formula", "Calculation", "Answers"],
      rows: [
        [
          "By reach (ERR)",
          "engagements ÷ reach × 100",
          "Of the people who actually saw this, how many acted? The best measure of content quality.",
        ],
        [
          "By followers (ER)",
          "engagements ÷ followers × 100",
          "How active is my audience relative to its size? The only one comparable across accounts.",
        ],
        [
          "By impressions",
          "engagements ÷ impressions × 100",
          "Similar to reach but counts repeat views, so it always reads lower.",
        ],
      ],
    },
    {
      type: "callout",
      title: "The one rule",
      text: "**Pick one and never switch.** A trend line built from mixed formulas is noise. If you change formula, recalculate your history or start a new chart — do not splice them.",
    },
    {
      type: "heading",
      text: "Which one to pick",
    },
    {
      type: "paragraph",
      text: "It depends on the decision you are making.",
    },
    {
      type: "list",
      items: [
        "**Judging content** → by reach. It isolates the post from the size of your audience, so it tells you whether the content worked.",
        "**Reporting to a client or exec** → by followers. It is the one competitors and benchmarks are usually quoted in, and it is the only one you can calculate for an account you do not own.",
        "**Diagnosing a drop** → both. If reach-based holds steady while follower-based falls, your content is fine and distribution shrank. If reach-based falls, the content is the problem. That single comparison is the most useful diagnostic in social analytics.",
      ],
    },
    {
      type: "heading",
      text: "What counts as an engagement",
    },
    {
      type: "paragraph",
      text: "The other reason numbers disagree. There is no universal definition, and the choice materially changes the result.",
    },
    {
      type: "list",
      items: [
        "**Always counted:** likes, comments, shares.",
        "**Usually counted:** saves. Often the highest-intent action on Instagram and the strongest signal to the algorithm.",
        "**Sometimes counted:** profile visits, link clicks, follows from the post, sticker taps.",
        "**Rarely counted, and shouldn't be:** plain views or impressions. These are passive — folding them in inflates the number and hides what is happening.",
      ],
    },
    {
      type: "paragraph",
      text: "Write your definition down. In six months you will not remember whether saves were in, and neither will whoever inherits the report.",
    },
    {
      type: "heading",
      text: "2026 benchmarks",
    },
    {
      type: "paragraph",
      text: "Treat these as orientation, not targets. They move with industry, account size, and which formula the study used — which is exactly the problem described above.",
    },
    {
      type: "table",
      caption:
        "Follower-based rates from published 2026 studies. Sources differ substantially; the ranking is more reliable than the absolute numbers.",
      columns: ["Platform", "Typical range", "Notes"],
      rows: [
        [
          "TikTok",
          "3–5%",
          "Consistently the highest. Distribution is content-led rather than follower-led.",
        ],
        [
          "LinkedIn",
          "2–6%",
          "High but heavily skewed: personal profiles far outperform company pages.",
        ],
        [
          "Instagram",
          "0.5–1.5%",
          "Saves and shares matter more than likes for the algorithm.",
        ],
        [
          "Facebook",
          "0.1–0.5%",
          "Organic reach for Pages is very low; the rate reflects that.",
        ],
        [
          "X",
          "0.1–0.5%",
          "High volume, fast decay. A post is largely finished within hours.",
        ],
      ],
    },
    {
      type: "callout",
      title: "Smaller accounts look better",
      text: "Engagement rate falls as follower count rises, almost without exception. A 10k account at 3% and a 500k account at 0.8% may have identical content quality. Compare yourself to accounts of similar size, or to your own past.",
    },
    {
      type: "heading",
      text: "Metrics that matter more than engagement rate",
    },
    {
      type: "paragraph",
      text: "Engagement rate is a decent health check and a poor goal. If you are optimising a single number, these are better ones.",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Saves and shares specifically.** A share puts your content in someone else's feed — it is the only engagement that directly buys distribution. A like does almost nothing by comparison. Track these separately rather than burying them in a blended rate.",
        "**Follower-to-reach ratio.** What share of your audience you actually reach. When this falls, distribution is shrinking regardless of how engagement looks.",
        "**Profile visits and follows per post.** The posts that grow an account are often not the ones with the best engagement rate.",
        "**Dwell time**, where the platform exposes it. On LinkedIn especially, time spent reading is now a stronger ranking signal than likes.",
        "**Whatever converts.** Clicks, signups, replies. Engagement is a proxy; this is the thing itself.",
      ],
    },
    {
      type: "heading",
      text: "A reporting setup that survives contact with reality",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Pick one formula.** Reach-based if you have reach data, follower-based if you do not.",
        "**Write down what counts as an engagement**, saves included or excluded, and keep it fixed.",
        "**Report the median, not the mean.** One post that went unusually wide will drag an average and make a normal month look like a great one.",
        "**Segment by content pillar and format.** A blended account-level number tells you nothing actionable. “Our teardown posts do 3x our announcement posts” does.",
        "**Compare to your own trailing 90 days** before comparing to anyone else's benchmark.",
      ],
    },
    {
      type: "paragraph",
      text: "The practical constraint is that per-platform native analytics all define this differently, so pulling a consistent number across nine networks by hand is tedious and error-prone. Social0's [analytics](/features/social-media-calendar) reports views, likes, comments, and engagement for the posts you published through it, across every connected account — with the same definition applied everywhere, which is the part that makes the trend line trustworthy.",
    },
    {
      type: "cta",
      text: "One consistent engagement number across every network you publish to.",
      href: "/features/multi-platform-scheduler",
      label: "See cross-platform analytics",
    },
    {
      type: "heading",
      text: "The honest summary",
    },
    {
      type: "paragraph",
      text: "Engagement rate is useful for spotting when something changed, and nearly useless as a target. It is easy to raise by posting less and only posting safe things, which is the opposite of what grows an account.",
    },
    {
      type: "paragraph",
      text: "Use it as a smoke alarm. Optimise for shares, saves, and whatever you actually needed social media to do for the business.",
    },
  ],
  faq: [
    {
      question: "How do you calculate engagement rate on social media?",
      answer:
        "The most common formula is engagements divided by reach, times 100. You can also divide by followers (the only version comparable across accounts you do not own) or by impressions (which reads lower because it counts repeat views). Pick one and use it consistently.",
    },
    {
      question: "What is a good engagement rate in 2026?",
      answer:
        "Roughly 3–5% on TikTok, 2–6% on LinkedIn, 0.5–1.5% on Instagram, and 0.1–0.5% on Facebook and X, measured against followers. Rates fall as follower count rises, so compare against accounts of similar size or against your own history rather than a global average.",
    },
    {
      question: "Should saves count as engagement?",
      answer:
        "Yes, and on Instagram they are arguably the most important action — a save signals lasting value and weighs heavily in recommendations. The key is deciding once whether they are included and keeping that definition fixed, since it materially changes the number.",
    },
    {
      question: "Why do different tools report different engagement rates?",
      answer:
        "Because they use different denominators (reach, followers, or impressions) and different definitions of what counts as an engagement. The same post can legitimately read as 1.2% in one tool and 6.5% in another. Comparing across tools is usually meaningless.",
    },
    {
      question: "What should I track instead of engagement rate?",
      answer:
        "Shares and saves specifically, since shares are the only engagement that directly buys distribution; your follower-to-reach ratio, which reveals shrinking distribution; and whatever actually converts for you. Engagement rate works as a health check, not a goal.",
    },
  ],
  relatedPaths: [
    { href: "/features/multi-platform-scheduler", label: "Multi-platform scheduler" },
    { href: "/features/social-media-calendar", label: "Content calendar" },
  ],
  relatedSlugs: [
    "best-time-to-post-on-social-media",
    "linkedin-algorithm-guide",
    "social-media-content-calendar",
  ],
};
