import type { BlogPost } from "../blog-types";

export const xAlgorithmGuide: BlogPost = {
  slug: "x-algorithm-guide",
  category: "Strategy",
  metaTitle: "How the Twitter (X) Algorithm Works in 2026, From the Code",
  metaDescription:
    "X publishes its ranking code. What the 2026 Grok-based Phoenix model predicts, the 48-hour cutoff, dwell time, author diversity, and what it means for your posts.",
  keywords: [
    "twitter algorithm",
    "x algorithm",
    "twitter algorithm 2026",
    "twitter algorithm change",
    "how the x algorithm works",
    "x algorithm open source",
    "x for you feed ranking",
  ],
  title: "How the Twitter (X) algorithm works in 2026",
  excerpt:
    "X publishes the code that builds the For You feed. In 2026 it's a Grok-based model called Phoenix that predicts about two dozen actions per post, from replies and dwell time to blocks and reports. Here is what the code says, and what it means for what you post.",
  datePublished: "2026-09-20",
  dateModified: "2026-11-26",
  readingMinutes: 9,
  body: [
    {
      type: "paragraph",
      text: "X is the only major network whose feed-ranking code is public. The current version lives in the **xai-org/x-algorithm** repository on GitHub (Apache 2.0), and X adds dated release notes as it changes. This guide is based on that repository as of November 2026. Where it repeats what creators observe but the code doesn't state, it says so.",
    },
    {
      type: "callout",
      title: "What changed from the old algorithm",
      text: "Older guides describe a \"Heavy Ranker\" scoring a pool of about 1,500 candidates, with a reply worth 27 likes. That was the **2023** release. The 2026 code is a different system: a Grok-based transformer called **Phoenix** ranks posts, and neither \"Heavy Ranker\" nor the 1,500 figure appears in it.",
    },
    {
      type: "heading",
      text: "How the For You feed is built",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Find candidates.** Thunder keeps recent posts from accounts you follow in memory. Posts from accounts you don't follow come from Phoenix retrieval (posts similar to what you engage with), SimClusters (communities of related accounts) and a pool of popular posts.",
        "**Filter.** Duplicates, your own posts, posts you've already seen, muted keywords, blocked or muted authors, and **anything older than 48 hours** are removed before scoring.",
        "**Score.** Phoenix predicts how likely you are to take each of about two dozen actions on each post, and adds those predictions up with fixed weights.",
        "**Adjust.** The score is then adjusted for author diversity, out-of-network posts and new authors (below), and the list is reordered so neighbouring posts aren't too similar.",
        "**Check visibility.** A separate system decides whether a post can be shown at all (allow, label, warn or drop). Ranking decides the order; visibility decides eligibility.",
      ],
    },
    {
      type: "paragraph",
      text: "Alongside this, Grox reads posts as they're published: classifiers for spam, adult and violent content, plus numeric representations of the text and images that the rankers use.",
    },
    {
      type: "heading",
      text: "What the model predicts",
    },
    {
      type: "paragraph",
      text: "The score is published as a formula: **Final score = Σ (weight × predicted probability of each action)**. Positive actions carry positive weights and negative actions carry negative ones. These are the actions Phoenix predicts:",
    },
    {
      type: "table",
      caption: "Actions in X's 2026 ranking model (xai-org/x-algorithm README)",
      columns: ["Group", "Actions predicted"],
      rows: [
        ["Engagement", "Like, reply, repost, quote, share, share via DM, share via copy link"],
        ["Clicks", "Open the post, open the profile, click a link, expand a photo, open a video, open a quoted post"],
        ["Attention", "Dwell, dwell time, video quality view, seconds of video watched, time spent on the profile"],
        ["Author", "Follow the author"],
        ["Negative", "Not interested, mute author, block author, report, scrolled past without dwelling"],
      ],
    },
    {
      type: "paragraph",
      text: "The exact weights are in the repository's parameter files rather than the README. X's own release notes warn against reading them as \"one report cancels out N likes\": they multiply predicted probabilities, not raw counts. The direction is still clear. Negative reactions weigh far more than a like, and actions that take effort or attention count for more than a tap.",
    },
    {
      type: "heading",
      text: "Attention now counts: dwell time",
    },
    {
      type: "paragraph",
      text: "The biggest 2026 change is attention. Phoenix predicts whether you'll stop on a post (**dwell**), for how long (**dwell time**), and how many seconds of a video you'll keep watching. In October 2026 X noted that the model got better at estimating time spent, and that retrieval now favours posts people read all the way through. \"Scrolled past without dwelling\" is itself a negative signal.",
    },
    {
      type: "list",
      items: [
        "**Make the first line worth stopping for.** A post nobody pauses on collects a negative signal even if nobody dislikes it.",
        "**Longer can win if it's read.** Premium's longer posts and threads earn dwell time, but only if people actually read them.",
        "**Video: the first seconds matter.** Continued viewing is predicted directly, so a slow intro costs you.",
      ],
    },
    {
      type: "heading",
      text: "Replies and conversation",
    },
    {
      type: "paragraph",
      text: "Replies, quotes and shares are predicted separately from likes, and they take effort, so posts that start conversations keep doing better. In practice:",
    },
    {
      type: "list",
      items: [
        "**Write posts people can answer:** a specific claim, an open question, a defensible opinion.",
        "**Reply to your replies.** It keeps the conversation going and brings people back to the post.",
        "**Skip engagement bait.** \"Reply with 🔥\" invites low-effort replies and can push people to mute or mark \"not interested\", which are the heaviest negative signals.",
      ],
    },
    {
      type: "heading",
      text: "Timing: the 48-hour cutoff",
    },
    {
      type: "paragraph",
      text: "The code filters out posts older than **48 hours** before scoring, so no post is recommended in For You after two days. Most reach comes much sooner. Post when your audience is online, and be around for the first hour to reply. If you can't be there at the best time, [schedule the post](/blog/how-to-schedule-x-posts) for a time you can.",
    },
    {
      type: "heading",
      text: "Diversity rules that limit your reach",
    },
    {
      type: "list",
      items: [
        "**Author diversity:** each of your posts after the first in someone's feed is scored down by a decaying factor. Ten posts in an hour mostly compete with each other.",
        "**Out-of-network discount:** posts from accounts the viewer doesn't follow get a factor below 1, so they need a higher predicted score to show up.",
        "**New-author boost:** authors with few impressions get lifted toward a target position, which gives small accounts a real chance.",
        "**Similarity reordering:** the final list is reshuffled so you don't see five near-identical posts in a row.",
      ],
    },
    {
      type: "heading",
      text: "Links and Premium: what the code does and doesn't say",
    },
    {
      type: "paragraph",
      text: "**Links:** the published code has no rule that penalises links; \"link click\" is a positive predicted action. Creators still widely report less reach on posts with links. A likely reason is that link posts send people away instead of earning dwell and replies. Posting the link in your own reply costs nothing, so many accounts still do it.",
    },
    {
      type: "paragraph",
      text: "**Premium:** the ranking code describes no Premium boost. Premium does raise the post limit from 280 to 25,000 characters, which makes longer, dwell-heavy posts possible, and X markets prioritised replies as a Premium feature. Treat the \"2–4× reach\" figures you'll see quoted as anecdotes, not something the code shows.",
    },
    {
      type: "cta",
      text: "Write X threads once and schedule them with Threads and Bluesky.",
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
        "**Earn the stop.** The first line decides dwell, and dwell is now scored.",
        "**Write for replies**, then reply back.",
        "**Avoid what makes people mute or report**: bait, repetition, rage.",
        "**Spread your posts out.** Author diversity discounts bursts.",
        "**Post when you can be present**, and remember nothing is recommended after 48 hours.",
        "**Use threads and long posts when people will read them all.** Check length with the [X character counter](/free-tools/post-preview/x) and split drafts with the [thread maker](/free-tools/twitter-thread-maker).",
      ],
    },
  ],
  faq: [
    {
      question: "How does the Twitter (X) algorithm work in 2026?",
      answer:
        "X finds candidate posts from accounts you follow (Thunder) and accounts you don't (Phoenix retrieval, SimClusters, popular posts), filters out duplicates, seen posts and anything older than 48 hours, then scores each one with a Grok-based model called Phoenix. Phoenix predicts about two dozen actions and adds them up with fixed weights. The code is public in the xai-org/x-algorithm repository.",
    },
    {
      question: "What changed in the X algorithm in 2026?",
      answer:
        "The 2023 Heavy Ranker was replaced by Phoenix, a Grok-based transformer. The 2026 code adds attention signals such as dwell time and video watch time, uses negative signals (not interested, mute, block, report, scrolled past), and applies author-diversity, out-of-network and new-author adjustments. X publishes dated release notes in the repository.",
    },
    {
      question: "What is the most important ranking signal on X?",
      answer:
        "No single one: the score is a weighted sum of predicted actions. Effortful actions (replies, shares, quotes, follows) and attention (dwell time, video watch) count for more than a like, and negative reactions such as mutes, blocks and reports weigh heavily against a post.",
    },
    {
      question: "Do links reduce reach on X?",
      answer:
        "The published ranking code has no explicit link penalty, but many creators report lower reach on link posts, likely because people leave instead of engaging. Putting the link in your own reply is a cheap workaround.",
    },
    {
      question: "Does X Premium increase reach?",
      answer:
        "The ranking code doesn't describe a Premium boost. Premium raises the post limit to 25,000 characters and X markets reply prioritisation as a Premium feature. Larger reach multipliers you'll see quoted are anecdotal.",
    },
    {
      question: "How long does a post on X get recommended?",
      answer:
        "At most 48 hours: the For You pipeline filters out older posts before scoring. In practice most reach arrives in the first hours.",
    },
  ],
  relatedPaths: [
    { href: "/features/twitter-scheduler", label: "X (Twitter) scheduler" },
    { href: "/free-tools/post-preview/x", label: "X character counter" },
    { href: "/free-tools/twitter-thread-maker", label: "Free thread maker" },
  ],
  relatedSlugs: [
    "how-to-schedule-x-posts",
    "bluesky-and-threads-for-brands",
    "linkedin-algorithm-guide",
  ],
};
