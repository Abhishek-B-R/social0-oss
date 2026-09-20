import type { BlogPost } from "../blog-types";

export const xAlgorithmGuide: BlogPost = {
  slug: "x-algorithm-guide",
  category: "Strategy",
  metaTitle: "How the X (Twitter) Algorithm Works in 2026",
  metaDescription:
    "Replies are worth many times a like, the first 30 minutes decide most of your reach, links cost you distribution, and Premium changes the maths. How the For You feed actually ranks posts.",
  keywords: [
    "x algorithm",
    "twitter algorithm",
    "how the x algorithm works",
    "twitter reach 2026",
    "x for you feed ranking",
    "twitter engagement signals",
  ],
  title: "How the X (Twitter) algorithm works in 2026",
  excerpt:
    "X publishes its ranking code, which makes it the least mysterious major feed. Replies dominate, the first half hour decides most of your reach, and putting a link in the post costs you a third of it.",
  datePublished: "2026-09-20",
  readingMinutes: 9,
  body: [
    {
      type: "paragraph",
      text: "X is unusual among major platforms in that its ranking algorithm is open source. You do not have to infer how it works from experiments — the broad shape is published, and it has held up.",
    },
    {
      type: "heading",
      text: "How a feed gets built",
    },
    {
      type: "paragraph",
      text: "For each For You session, X assembles a candidate pool — commonly around **1,500 posts** — drawn from accounts you follow and from out-of-network content it predicts you will engage with. Those candidates are scored by a neural ranking model (the “Heavy Ranker”) that predicts how likely you are to take each possible action. The predictions are weighted and summed, and the feed is the result, ordered by score.",
    },
    {
      type: "paragraph",
      text: "The important implication: **the weights on those predicted actions are not equal.** Optimising for the cheap ones is a losing strategy.",
    },
    {
      type: "heading",
      text: "Replies dominate everything",
    },
    {
      type: "callout",
      title: "The single most important number here",
      text: "A **reply is worth roughly 27× a like** in X's scoring. Not marginally more — an order of magnitude more. Everything else in this guide follows from that one ratio.",
    },
    {
      type: "paragraph",
      text: "X is optimising for conversation, because conversation keeps people on the platform. A post with 40 replies and 100 likes will substantially out-distribute one with 5 replies and 1,000 likes.",
    },
    {
      type: "paragraph",
      text: "What this changes in practice:",
    },
    {
      type: "list",
      items: [
        "**Write posts that are answerable.** A complete, self-contained statement leaves nothing to say. A specific claim, an open question, or a genuine disagreement invites a response.",
        "**Reply to your own replies.** Each exchange is another high-weight signal, and it pulls the other person back.",
        "**Take the mild position, not the safe one.** Universal agreement produces likes. A defensible opinion people want to push back on produces replies.",
        "**Avoid engagement bait.** “Reply with a 🔥” generates low-quality replies, and since March 2026 reply *quality* is itself a ranking input.",
      ],
    },
    {
      type: "paragraph",
      text: "That last point is newer and worth knowing: X now treats reply quality as a direct signal, with Premium users able to downvote replies flagged as AI-generated, misleading, or spam. Farming shallow replies is no longer neutral — it can work against you.",
    },
    {
      type: "heading",
      text: "The first 30 minutes",
    },
    {
      type: "paragraph",
      text: "Engagement **velocity** matters more than eventual totals, and the opening window is decisive — roughly **70% of a post's eventual reach** is determined in the first half hour.",
    },
    {
      type: "paragraph",
      text: "X's content also decays faster than any other network in this series. A post is largely finished within hours, where a Short can accumulate views for months. That makes timing matter more here than almost anywhere else.",
    },
    {
      type: "list",
      items: [
        "**Post when your audience is awake and scrolling.** For most audiences that is weekday mornings, roughly 9am–12pm.",
        "**Be available for that half hour.** Replying quickly compounds: your reply is a high-weight signal and it brings the replier back.",
        "**Do not post and leave.** If you cannot attend the window, schedule it for when you can. That is the practical argument for scheduling on X — choosing a slot you can staff, not automating away your presence.",
      ],
    },
    {
      type: "heading",
      text: "Links cost you reach",
    },
    {
      type: "paragraph",
      text: "Posts containing an external link receive materially less distribution — figures around **30–40% less** are commonly reported. X, like LinkedIn, would rather you stayed.",
    },
    {
      type: "paragraph",
      text: "The workaround is the same and it still works: publish the post without the link, then put the link in your own reply. You keep the distribution on the main post and the people who want the link still get it.",
    },
    {
      type: "callout",
      title: "Cross-posting note",
      text: "This is the opposite of Bluesky, which applies no link penalty at all. If you mirror posts between the two, the link belongs in the post on Bluesky and in a reply on X. See [Bluesky vs Threads](/blog/bluesky-and-threads-for-brands).",
    },
    {
      type: "heading",
      text: "Premium changes the maths",
    },
    {
      type: "paragraph",
      text: "Worth being plain about: Premium subscribers receive a reach multiplier — commonly described as **2–4×** — and Premium replies are prioritised toward the top of conversation threads.",
    },
    {
      type: "paragraph",
      text: "Whether that is good for the platform is a separate question. Operationally, if X is a meaningful channel for you, the subscription is doing more work than most of the tactics in this guide. Premium also raises the character limit from 280 to 25,000, which changes what you can publish — a scheduler needs to detect the account's actual status rather than assume 280.",
    },
    {
      type: "heading",
      text: "Signal weights, roughly",
    },
    {
      type: "table",
      columns: ["Action", "Relative weight", "Notes"],
      rows: [
        ["Reply", "Highest — ~27× a like", "The dominant signal."],
        ["Bookmark", "High", "Strong private-value signal."],
        ["Repost", "High", "Extends into a new network."],
        ["Profile click → engagement", "High", "Signals genuine interest in you."],
        ["Like", "Baseline", "Cheap, and weighted as such."],
        ["“Not interested” / mute / block", "Strongly negative", "Costs far more than a like gains."],
      ],
    },
    {
      type: "heading",
      text: "Threads, and why they work",
    },
    {
      type: "paragraph",
      text: "A thread performs well for structural reasons rather than because X favours the format: each post is another surface, people replying to any post in the chain feeds the whole thing, and dwell time rises as people read down.",
    },
    {
      type: "paragraph",
      text: "The first post still has to stand alone — nobody reaches post four if post one does not earn it. Write it as if it is the only thing that will be read, because for most of your audience it is.",
    },
    {
      type: "cta",
      text: "Compose threads for X, Bluesky, and Threads from one draft.",
      href: "/features/twitter-scheduler",
      label: "See the X scheduler",
    },
    {
      type: "heading",
      text: "A working approach",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Write for replies.** Every post should leave something worth saying.",
        "**Post weekday mornings** and stay for the first 30 minutes.",
        "**Keep links out of the post.** Put them in your own reply.",
        "**Reply substantively to others daily.** With replies weighted this heavily, being present in other people's threads is a genuine distribution strategy.",
        "**Use threads for anything with more than one idea in it.**",
        "**Consider Premium** if X matters commercially. The multiplier outweighs most tactical tuning.",
      ],
    },
    {
      type: "paragraph",
      text: "X rewards being a participant rather than a broadcaster, and the 27× ratio is the platform stating that outright. An account that only posts is playing the weakest hand available.",
    },
  ],
  faq: [
    {
      question: "How does the X (Twitter) algorithm work in 2026?",
      answer:
        "X assembles a candidate pool of roughly 1,500 posts per session from in-network and out-of-network sources, scores each with a neural ranking model that predicts your likely actions, and orders the feed by weighted score. The algorithm is open source, so the broad structure is published rather than inferred.",
    },
    {
      question: "What is the most important ranking signal on X?",
      answer:
        "Replies, by a wide margin — a reply is worth roughly 27 times a like in X's scoring. Bookmarks and reposts follow. Likes are the baseline and weighted accordingly, which is why posts with strong reply counts out-distribute posts with far more likes.",
    },
    {
      question: "Do links reduce reach on X?",
      answer:
        "Yes, by around 30–40%. The standard workaround still works: publish the post without the link and add the link in your own reply. Note this is the opposite of Bluesky, which applies no link penalty.",
    },
    {
      question: "How long does a post on X keep getting reach?",
      answer:
        "Not long — X decays faster than any other major network. Roughly 70% of a post's eventual reach is determined in the first 30 minutes, and a post is largely finished within hours. This makes posting time and being present to reply matter more on X than elsewhere.",
    },
    {
      question: "Does X Premium actually increase reach?",
      answer:
        "Yes. Premium accounts receive a reach multiplier commonly described as 2–4×, and Premium replies are prioritised in conversation threads. It also raises the character limit from 280 to 25,000. If X is a commercially meaningful channel, the subscription tends to outweigh most tactical optimisation.",
    },
  ],
  relatedPaths: [
    { href: "/features/twitter-scheduler", label: "X (Twitter) scheduler" },
    { href: "/tools/auto-plug", label: "Auto-plug" },
    { href: "/tools/auto-repost", label: "Auto-repost" },
  ],
  relatedSlugs: [
    "bluesky-and-threads-for-brands",
    "linkedin-algorithm-guide",
    "social-media-character-limits",
  ],
};
