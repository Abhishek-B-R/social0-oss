import type { BlogPost } from "../blog-types";

export const socialMediaContentCalendar: BlogPost = {
  slug: "social-media-content-calendar",
  category: "Strategy",
  metaTitle: "How to Build a Social Media Content Calendar That You'll Actually Use",
  metaDescription:
    "A practical system for planning social content: choosing a cadence you can sustain, content pillars, batching, queue slots, and the failure modes that kill most calendars by week three.",
  keywords: [
    "social media content calendar",
    "content calendar template",
    "social media planning",
    "content pillars",
    "batch social media content",
    "social media posting schedule",
  ],
  title: "How to build a social media content calendar you'll actually use",
  excerpt:
    "Most content calendars are abandoned by week three — not from laziness, but because they were built for an unrealistic cadence with no system behind them. Here is one that survives a busy month.",
  datePublished: "2026-09-05",
  dateModified: "2026-09-20",
  readingMinutes: 10,
  body: [
    {
      type: "paragraph",
      text: "The spreadsheet is not the problem. Almost everyone who abandons a content calendar built a perfectly reasonable one — then discovered that filling it every week required a kind of daily discipline the calendar itself did nothing to support.",
    },
    {
      type: "paragraph",
      text: "A calendar that works is less a document than a set of decisions made in advance, so that the daily version of you has nothing left to decide.",
    },
    {
      type: "heading",
      text: "Start with a cadence you can hold in a bad week",
    },
    {
      type: "paragraph",
      text: "The single most common failure is picking a cadence based on an optimistic week. Ask instead: what could I still post during the worst week of last quarter — a launch week, a sick week, a travel week?",
    },
    {
      type: "paragraph",
      text: "That number is your cadence. It is probably lower than you want it to be, and that is fine: **three posts a week every week beats seven posts one week and none the next.** Both algorithms and audiences reward predictability, and a gap costs more than the extra posts gained.",
    },
    {
      type: "callout",
      title: "Starting points",
      text: "Solo founder or creator: **3–4 posts a week on one primary platform**, cross-posted to two or three secondaries. Small team: **5 a week on the primary**. Anything above daily needs either a dedicated person or a genuine content engine behind it — not willpower.",
    },
    {
      type: "heading",
      text: "Pick three or four content pillars",
    },
    {
      type: "paragraph",
      text: "A pillar is a recurring category you will post about. Their job is to eliminate the blank page: you are never asking “what should I post?”, only “what's the next one in this pillar?”",
    },
    {
      type: "paragraph",
      text: "For a B2B software company, a set that works:",
    },
    {
      type: "list",
      items: [
        "**Build in public** — what you shipped, what broke, what you learned.",
        "**Teaching** — a specific problem in your domain and how to solve it.",
        "**Proof** — customer outcomes, numbers, before and after.",
        "**Point of view** — where you disagree with how your industry does something.",
      ],
    },
    {
      type: "paragraph",
      text: "Three to four is the right count. Two is monotonous; six means you are not actually building an identity in any of them. Rotate through them rather than batching a week of one.",
    },
    {
      type: "heading",
      text: "Batch production, drip publication",
    },
    {
      type: "paragraph",
      text: "This is the structural change that makes the rest possible. Producing content and publishing content are different activities with different rhythms, and trying to do both daily means doing both badly.",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**One planning block a month.** Pick the month's themes, note what is coming — launches, events, seasonal hooks — and fill the calendar with topics, not finished posts. An hour.",
        "**One production block a week.** Write and make the next two weeks of content in a single session. Context-switching into “social media mode” once a week costs far less than doing it daily.",
        "**Schedule everything at the end of that block.** The calendar is now full and publication is automatic.",
        "**Leave 20% of slots empty.** For the thing that happens on Wednesday that you could not have planned — a customer story, a news hook, a reply that turned into a post. A calendar with no slack cannot respond to anything.",
      ],
    },
    {
      type: "paragraph",
      text: "Working two weeks ahead is the sweet spot. Further and you lose relevance; closer and one bad week empties the queue.",
    },
    {
      type: "heading",
      text: "Queue slots beat picking times",
    },
    {
      type: "paragraph",
      text: "Here is a small mechanical change with a disproportionate effect. Most people schedule by choosing a date and time for each post. That is a decision per post, and decisions are what you run out of.",
    },
    {
      type: "paragraph",
      text: "Instead, define **recurring weekly slots** once — say Tuesday, Wednesday, and Friday at 9am — and then assign posts to the next available slot. The timing decision is made once, for all time. Adding a post becomes a single click rather than a calendar negotiation.",
    },
    {
      type: "paragraph",
      text: "It also enforces the cadence structurally: an empty slot next Tuesday is visible now, while you still have time to do something about it.",
    },
    {
      type: "cta",
      text: "Set recurring slots once, then just add posts to the queue.",
      href: "/tools/queue",
      label: "See the posting queue",
    },
    {
      type: "heading",
      text: "What a calendar row should contain",
    },
    {
      type: "paragraph",
      text: "Keep it minimal. Every field you add is a field you will stop filling in by week three.",
    },
    {
      type: "table",
      columns: ["Field", "Why"],
      rows: [
        ["Date / slot", "When it publishes."],
        ["Pillar", "So you can see at a glance if you have drifted into one category."],
        ["Hook", "The first line. If you cannot write the hook, you do not have the post yet."],
        ["Format", "Text, image, video, thread, carousel — drives production effort."],
        ["Platforms", "Which accounts. Most rows are 'all'; the exceptions matter."],
        ["Status", "Idea → drafted → scheduled. Three states, not seven."],
        ["Asset", "Link to the image or video, if any."],
      ],
    },
    {
      type: "paragraph",
      text: "Deliberately absent: approval chains, campaign codes, expected engagement. Add those only when a real process demands them, which for most teams is never.",
    },
    {
      type: "heading",
      text: "The four ways calendars die",
    },
    {
      type: "subheading",
      text: "Perfectionism on individual posts",
    },
    {
      type: "paragraph",
      text: "Spending forty minutes on a post that takes eight seconds to read is a bad trade. Post quality matters enormously in aggregate and very little on any individual post, because you cannot predict which ones land. Ship at 80% and post more often.",
    },
    {
      type: "subheading",
      text: "Planning in a tool you don't publish from",
    },
    {
      type: "paragraph",
      text: "A calendar in a spreadsheet and a queue in a scheduler means every post is entered twice, and the two drift within a month. Plan where you publish.",
    },
    {
      type: "subheading",
      text: "No visible empty state",
    },
    {
      type: "paragraph",
      text: "If you cannot see that next week is empty, you find out on Monday. A calendar view where gaps are obvious is doing work a list cannot.",
    },
    {
      type: "subheading",
      text: "Measuring the wrong thing",
    },
    {
      type: "paragraph",
      text: "Tracking follower count weekly tells you almost nothing and is demoralising in slow months. Track what you control and what predicts growth: posts published against planned, engagement rate per post by pillar, and which pillar is actually working. Then post more of that.",
    },
    {
      type: "heading",
      text: "A first month",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Week 1.** Pick your cadence — the bad-week number. Define three pillars. Set recurring queue slots.",
        "**Week 2.** Batch-produce two weeks of content in one session. Schedule all of it. Notice how long it actually took.",
        "**Week 3.** Publish nothing new manually. Let the queue run. Spend the time reading what performed.",
        "**Week 4.** Produce the next two weeks. Drop the weakest pillar if one is clearly not working; replace it.",
      ],
    },
    {
      type: "paragraph",
      text: "After a month you will know your real production rate rather than your hoped-for one — which is the number the whole system should be built around.",
    },
    {
      type: "paragraph",
      text: "Social0's [content calendar](/features/social-media-calendar) shows scheduled, queued, draft, and published posts across every connected account in one view, so the gaps are visible while they are still fixable. Planning and publishing happen in the same place, which removes the most common reason calendars drift.",
    },
  ],
  faq: [
    {
      question: "How often should I post on social media?",
      answer:
        "Pick the number you could sustain during your worst week, not your best. For most solo creators and founders that is three to four posts a week on a primary platform, cross-posted to secondaries. Consistency matters more than volume — three a week every week beats seven then none.",
    },
    {
      question: "What are content pillars?",
      answer:
        "Three or four recurring categories you post about consistently. Their purpose is to remove the blank page: instead of asking what to post, you ask what comes next in a given pillar. Three to four is right — two is monotonous, six means no clear identity.",
    },
    {
      question: "How far ahead should I schedule social media posts?",
      answer:
        "About two weeks. Further ahead and content loses relevance to anything currently happening; closer and a single disrupted week empties the queue. Leave roughly 20% of slots open for timely content you could not have planned.",
    },
    {
      question: "Should I use a spreadsheet or a scheduling tool for my content calendar?",
      answer:
        "Whichever one you publish from. Planning in a spreadsheet and publishing from a separate scheduler means entering every post twice, and the two drift out of sync within a month.",
    },
    {
      question: "What metrics should I track for a content calendar?",
      answer:
        "Posts published against posts planned, engagement rate per post, and performance broken down by content pillar. Follower count tracked weekly is noisy and demoralising; pillar-level engagement tells you what to make more of.",
    },
  ],
  relatedPaths: [
    { href: "/features/social-media-calendar", label: "Content calendar" },
    { href: "/tools/queue", label: "Posting queue" },
    { href: "/tools/bulk-image", label: "Bulk scheduling" },
  ],
  relatedSlugs: [
    "best-time-to-post-on-social-media",
    "cross-posting-vs-repurposing",
    "social-media-character-limits",
  ],
};
