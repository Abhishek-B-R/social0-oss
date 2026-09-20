import type { BlogPost } from "../blog-types";

export const linkedinAlgorithmGuide: BlogPost = {
  slug: "linkedin-algorithm-guide",
  category: "Strategy",
  metaTitle: "How the LinkedIn Algorithm Works in 2026 (And What Still Gets Reach)",
  metaDescription:
    "Dwell time, the first-hour test, why personal profiles beat company pages, which formats still work, and the tactics that stopped working — a practical guide to LinkedIn organic reach.",
  keywords: [
    "linkedin algorithm",
    "linkedin organic reach",
    "how linkedin algorithm works",
    "linkedin post reach 2026",
    "linkedin content strategy",
    "linkedin company page vs personal profile",
  ],
  title: "How the LinkedIn algorithm works in 2026",
  excerpt:
    "Dwell time overtook likes, the first hour decides everything, and company pages are structurally disadvantaged. What the algorithm rewards now, and which once-reliable tactics are dead.",
  datePublished: "2026-09-20",
  readingMinutes: 10,
  body: [
    {
      type: "paragraph",
      text: "LinkedIn is the one major network where organic reach for a small account is still genuinely achievable. It is also the one where the advice ages fastest — most of what worked in 2023 has been actively neutralised.",
    },
    {
      type: "paragraph",
      text: "Here is the current shape of it.",
    },
    {
      type: "heading",
      text: "The first hour decides the post",
    },
    {
      type: "paragraph",
      text: "When you publish, LinkedIn shows the post to a small slice of your network — commonly cited as 2–5%. It watches what happens. Strong early signals earn expansion to second- and third-degree connections; weak ones mean the post effectively stops there.",
    },
    {
      type: "paragraph",
      text: "The practical consequences are unglamorous but real:",
    },
    {
      type: "list",
      items: [
        "**Post when your audience is actually online.** For most B2B audiences that is Tuesday to Thursday, roughly 7:30–9:00am — people checking LinkedIn before the day starts.",
        "**Be present for the first hour.** Replying to comments quickly is itself a ranking signal, and it pulls the commenter back for another interaction.",
        "**Do not publish and leave.** A post you cannot tend for an hour is better scheduled for a time you can.",
      ],
    },
    {
      type: "callout",
      title: "Why this makes scheduling useful, not useless",
      text: "The instinct is that automation conflicts with being present. The opposite: scheduling lets you choose a slot you know you can attend, instead of posting whenever you happened to finish writing. Write on Sunday, publish Tuesday 8am, be there for the hour.",
    },
    {
      type: "heading",
      text: "Dwell time is the dominant signal",
    },
    {
      type: "paragraph",
      text: "The single most important shift: LinkedIn now weights **how long people spend with your post** above how many liked it. A post that stops the scroll for twenty seconds outperforms one that collects quick likes as people pass.",
    },
    {
      type: "paragraph",
      text: "What this rewards:",
    },
    {
      type: "list",
      items: [
        "**Posts worth reading to the end.** 150–300 words is the sweet spot — enough substance to hold attention, short enough to finish.",
        "**A first two lines that earn the “see more” click.** Expanding the post is itself a dwell signal, so the opening is doing double duty.",
        "**Documents and carousels**, which generate far more dwell time than a single image because people swipe through them.",
        "**Specifics over abstractions.** Numbers, named situations, and real detail hold attention; generic insight does not.",
      ],
    },
    {
      type: "paragraph",
      text: "And what it punishes: anything that looks like it was written to be skimmed. The one-line-per-paragraph broetry format that dominated 2022 now reads as a tell, and it gives people less to spend time on.",
    },
    {
      type: "heading",
      text: "Format, ranked",
    },
    {
      type: "table",
      columns: ["Format", "Reach", "Why"],
      rows: [
        [
          "Text-only",
          "Highest",
          "No competing element, no outbound link, pure dwell time. Still the most reliable format.",
        ],
        [
          "Document / carousel",
          "High",
          "2–3x the dwell time of a single image. Excellent for frameworks and step-by-step content.",
        ],
        [
          "Native video (under ~30s)",
          "High for cold audiences",
          "Strong completion rates. Longer video drops off sharply.",
        ],
        [
          "Single image",
          "Moderate",
          "Fine, but the image has to add something the text does not.",
        ],
        [
          "Post with an outbound link",
          "Lowest",
          "LinkedIn suppresses content that sends people away. Put the link in the first comment.",
        ],
      ],
    },
    {
      type: "callout",
      title: "The link workaround still works",
      text: "Publish the post without a link, then add the link as your own first comment and edit it into the post later if you want. The reach difference is large enough to be worth the extra step.",
    },
    {
      type: "heading",
      text: "Personal profiles beat company pages, structurally",
    },
    {
      type: "paragraph",
      text: "This is not a tactic gap you can close with better content. Company page organic posts make up a very small share of what appears in feeds — figures around 2% are commonly cited — while personal profiles see several times the engagement for equivalent content.",
    },
    {
      type: "paragraph",
      text: "LinkedIn is a network of people, and it ranks accordingly. What to do about it:",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Publish the substance from personal profiles** — founders, engineers, whoever has something specific to say.",
        "**Use the company page for record, not reach.** Announcements, credibility for people who look you up, and a home for the brand.",
        "**Do not have the page post and the team mechanically reshare it.** Resharing a page post carries the page post's weak distribution. Writing an original take performs far better.",
        "**Give people their own angle.** Five people posting the same launch in their own words beats one page post with five reshares.",
      ],
    },
    {
      type: "paragraph",
      text: "If you are coordinating several people posting on the same theme, that is a scheduling problem — staggering posts across days so they do not compete with each other, and keeping track of who covered what. Social0's [teams and workspaces](/tools/teams) handle multiple people publishing to their own connected accounts under one workflow.",
    },
    {
      type: "cta",
      text: "Coordinate several people posting to their own LinkedIn profiles.",
      href: "/features/linkedin-scheduler",
      label: "See the LinkedIn scheduler",
    },
    {
      type: "heading",
      text: "What stopped working",
    },
    {
      type: "list",
      items: [
        "**“Comment your email and I'll send the guide.”** Heavily penalised. It generated comment volume without conversation, and the algorithm now recognises the pattern.",
        "**Engagement pods.** LinkedIn detects coordinated reciprocal engagement and discounts it. At scale it risks the account.",
        "**Broetry formatting.** One line per paragraph to force the “see more” click. Recognised, and it reduces the dwell time it was designed to manufacture.",
        "**Hashtag stuffing.** Three relevant tags at most. LinkedIn never leaned on them heavily and leans less now.",
        "**Pure AI-written posts.** Generic model output reads as generic and gets the engagement generic content deserves. The useful pattern is AI for structure and editing, with your own specifics and opinion carrying the post.",
      ],
    },
    {
      type: "heading",
      text: "A cadence that works",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Three to four posts a week**, from a personal profile. More is possible; fewer struggles to build momentum.",
        "**Tuesday to Thursday, 7:30–9:00am**, in your audience's timezone. Test around it, but start there.",
        "**Rotate formats.** Two text posts, one document, one video in a typical week.",
        "**Block the first hour after publishing** for replies. This is the highest-leverage hour you will spend on LinkedIn.",
        "**Comment substantively on other people's posts daily.** Reach on LinkedIn compounds through visibility in other people's comment sections more than most people expect.",
      ],
    },
    {
      type: "paragraph",
      text: "None of this is a hack. The algorithm has converged on rewarding content people genuinely spend time with, written by a person with a name and a face, who then turns up to talk about it. That is harder to game and easier to sustain than what it replaced.",
    },
  ],
  faq: [
    {
      question: "How does the LinkedIn algorithm work in 2026?",
      answer:
        "LinkedIn shows a new post to a small slice of your network — around 2–5% — and watches the early response. Strong signals in roughly the first hour earn expansion to wider degrees of connection. Dwell time, meaning how long people spend reading, is now the dominant ranking signal, ahead of likes.",
    },
    {
      question: "What type of LinkedIn post gets the most reach?",
      answer:
        "Text-only posts of roughly 150–300 words, followed by document or carousel posts, which generate two to three times the dwell time of a single image. Posts containing an outbound link get the least reach — put the link in the first comment instead.",
    },
    {
      question: "Do LinkedIn company pages get less reach than personal profiles?",
      answer:
        "Yes, substantially and structurally. Company page posts make up a very small share of feed content, while personal profiles see several times the engagement for equivalent posts. Publish substance from personal profiles and use the page for announcements and credibility.",
    },
    {
      question: "Should I put links in LinkedIn posts?",
      answer:
        "Not in the post body if reach matters. LinkedIn suppresses content that sends people off-platform. Publish without the link and add it as your own first comment — the reach difference is large enough to justify the extra step.",
    },
    {
      question: "How often should I post on LinkedIn?",
      answer:
        "Three to four times a week from a personal profile, ideally Tuesday to Thursday between 7:30 and 9:00am in your audience's timezone. Consistency matters more than volume, and being available to reply during the first hour after posting is worth more than an extra post.",
    },
  ],
  relatedPaths: [
    { href: "/features/linkedin-scheduler", label: "LinkedIn scheduler" },
    { href: "/tools/teams", label: "Teams & workspaces" },
    { href: "/tools/queue", label: "Posting queue" },
  ],
  relatedSlugs: [
    "x-algorithm-guide",
    "instagram-algorithm-guide",
    "social-media-engagement-rate",
  ],
};
