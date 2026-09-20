import type { BlogPost } from "../blog-types";

export const connectSocialAccountsTroubleshooting: BlogPost = {
  slug: "connect-social-accounts-troubleshooting",
  category: "Platform specs",
  metaTitle: "Why Your Social Account Won't Connect to a Scheduler (And How to Fix It)",
  metaDescription:
    "Instagram needs a professional account, Facebook needs a Page, TikTok needs the right product — the account requirements and permission problems that block scheduling, and how to fix each one.",
  keywords: [
    "cant connect instagram to scheduler",
    "instagram scheduling not working",
    "social media account wont connect",
    "instagram business account required scheduling",
    "reconnect social media account token expired",
  ],
  title: "Why your social account won't connect to a scheduler",
  excerpt:
    "Almost every failed connection comes down to one of five things: wrong account type, a missing Page link, an insufficient role, a permission that wasn't granted, or a token that quietly died. Here's how to tell which.",
  datePublished: "2026-09-20",
  readingMinutes: 9,
  body: [
    {
      type: "paragraph",
      text: "Connection problems produce some of the least helpful error messages in software. “Something went wrong” covers a wrong account type, a missing permission, and an expired token equally badly — and the fix for each is completely different.",
    },
    {
      type: "paragraph",
      text: "Here is how to diagnose it properly, by platform.",
    },
    {
      type: "heading",
      text: "Instagram",
    },
    {
      type: "paragraph",
      text: "The most common one by a distance, and it is nearly always account type.",
    },
    {
      type: "subheading",
      text: "It must be a professional account",
    },
    {
      type: "paragraph",
      text: "Instagram only permits API publishing from **Business or Creator** accounts. A personal profile cannot be scheduled to, by any tool — this is a platform rule, not a limitation of whichever scheduler you are using.",
    },
    {
      type: "paragraph",
      text: "Fix: Instagram app → Settings → Account type and tools → Switch to professional account. Then reconnect.",
    },
    {
      type: "subheading",
      text: "It usually needs a linked Facebook Page",
    },
    {
      type: "paragraph",
      text: "Publishing permissions flow through Meta's graph, and for most setups that means the Instagram account must be linked to a Facebook Page. If the link is missing, the connection completes but publishing fails later — which is worse than failing immediately, because you do not find out until a post is due.",
    },
    {
      type: "paragraph",
      text: "Fix: Instagram app → Settings → Sharing and reposting → Facebook, or link it from the Page's settings. Then reconnect the scheduler.",
    },
    {
      type: "subheading",
      text: "Your role on the Page may be too low",
    },
    {
      type: "paragraph",
      text: "If you manage the Page for someone else, you need at least content-level access. Viewer or analyst roles authorise successfully and then cannot publish.",
    },
    {
      type: "callout",
      title: "Agency tip",
      text: "Get added to the client's **Business Manager** with an explicit role rather than being added ad hoc to the Page. Ad hoc access disappears when someone tidies up permissions, and it takes your scheduled posts with it.",
    },
    {
      type: "heading",
      text: "Facebook",
    },
    {
      type: "paragraph",
      text: "The recurring surprise: **Pages only.** You cannot schedule to a personal Facebook profile through any API — Meta does not offer it. If you are trying to post to a profile, the answer is to create a Page.",
    },
    {
      type: "paragraph",
      text: "Beyond that, the usual causes are an insufficient Page role, or the Page not appearing in the picker because the authorising user does not administer it.",
    },
    {
      type: "heading",
      text: "TikTok",
    },
    {
      type: "paragraph",
      text: "TikTok splits access into separate **products**, each approved independently. A token issued for one does not work for another, which produces confusing permission errors that look like a broken connection.",
    },
    {
      type: "list",
      items: [
        "**Content Posting** — what you need to publish video and photo posts.",
        "**Business Messaging** — separate, and required for DM access. A Login Kit token alone will fail against messaging endpoints no matter how many times you reconnect.",
      ],
    },
    {
      type: "paragraph",
      text: "If posting works but the inbox does not, this split is almost certainly why. It is not a bug in the scheduler.",
    },
    {
      type: "heading",
      text: "YouTube",
    },
    {
      type: "paragraph",
      text: "Two things catch people. First, if your Google account has access to several channels, the OAuth flow may authorise the wrong one — check which channel was actually selected. Second, uploads consume a daily quota measured in cost units where uploads are expensive, so a burst of scheduled videos can exhaust it and produce failures that look like auth problems but are not.",
    },
    {
      type: "heading",
      text: "X (Twitter)",
    },
    {
      type: "paragraph",
      text: "X's access is tiered and paid, and capabilities differ by tier. A connection can succeed while a specific action — longer video, certain post types — fails because of the tier rather than the connection. If the account is verified, character limits also change, which a scheduler needs to detect rather than assume.",
    },
    {
      type: "heading",
      text: "LinkedIn",
    },
    {
      type: "paragraph",
      text: "Personal profile posting is broadly available. Company page posting requires you to be an admin of the page, and the page must be selected explicitly during connection — connecting your profile does not grant page access implicitly.",
    },
    {
      type: "heading",
      text: "Bluesky",
    },
    {
      type: "paragraph",
      text: "The easiest of the set: no OAuth, no app review. You generate an **app password** in Bluesky settings and use it with your handle. If it fails, it is almost always because someone entered their main account password instead of an app password.",
    },
    {
      type: "heading",
      text: "The connection worked and then stopped",
    },
    {
      type: "paragraph",
      text: "A different problem with a different fix. The connection was fine; the token died. Common causes:",
    },
    {
      type: "table",
      columns: ["Cause", "Signal", "Fix"],
      rows: [
        [
          "Token expired",
          "Worked for weeks, now fails on every post.",
          "Reconnect. Meta's long-lived tokens lapse after roughly 60 days without refresh.",
        ],
        [
          "Password changed",
          "Stopped immediately after a password change.",
          "Reconnect.",
        ],
        [
          "Permission revoked",
          "Someone tidied up connected apps.",
          "Reconnect and re-grant.",
        ],
        [
          "2FA newly enabled",
          "Meta surfaces this as lost publishing permission.",
          "Log out of Business Suite fully, log back in, reauthorise.",
        ],
        [
          "Role removed",
          "Only this one account fails; others are fine.",
          "Get the role restored, then reconnect.",
        ],
      ],
    },
    {
      type: "callout",
      title: "Retrying will never fix this",
      text: "A dead token fails identically every time. This is a **reconnect**, not a transient error — which is why a good scheduler marks the connection as needing reauthorisation and prompts you, rather than burning three retries and reporting a generic failure.",
    },
    {
      type: "heading",
      text: "A diagnostic order that saves time",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "**Did it ever work?** If no, it is account type, a missing link, or a role. If yes, it is a token or permission that changed.",
        "**Is it one account or all of them?** One account points at that account's config or role. All accounts on one platform points at the platform integration. All accounts everywhere points at your own session.",
        "**Does posting work but the inbox not**, or vice versa? That is a permission scope or product split, not a connection failure.",
        "**Check the account type first**, every time. It is the single most common cause and takes ten seconds to rule out.",
      ],
    },
    {
      type: "paragraph",
      text: "Social0 surfaces token health on the Connections page and treats an auth failure as a reconnect prompt rather than a retry, so a dead connection shows up as something you can act on instead of a string of failed posts. If you are running many accounts, [managing multiple accounts](/blog/managing-multiple-social-accounts) covers making that a routine check rather than a discovery.",
    },
    {
      type: "cta",
      text: "Connect nine networks with official OAuth and visible token health.",
      href: "/features",
      label: "See supported platforms",
    },
    {
      type: "heading",
      text: "What no tool can do for you",
    },
    {
      type: "paragraph",
      text: "Worth stating plainly, because it is occasionally promised: **OAuth consent requires a human in a browser.** No scheduler, API, or AI agent can connect an Instagram or YouTube account on your behalf. Anything offering to do that is asking for your password, which you should not give it.",
    },
    {
      type: "paragraph",
      text: "Connecting accounts is a one-time manual step per account. Everything after it can be automated.",
    },
  ],
  faq: [
    {
      question: "Why can't I connect my Instagram account to a scheduler?",
      answer:
        "Almost always because it is a personal profile. Instagram only allows API publishing from Business or Creator accounts. Switch it in Instagram → Settings → Account type and tools, make sure it is linked to a Facebook Page, then reconnect.",
    },
    {
      question: "Can you schedule posts to a personal Facebook profile?",
      answer:
        "No. Meta does not offer API publishing to personal profiles — Pages only. This applies to every scheduling tool, so if you need to publish programmatically to Facebook, you need a Page.",
    },
    {
      question: "Why does my scheduler post to TikTok but not show DMs?",
      answer:
        "TikTok splits access into separately approved products. Content Posting covers publishing; Business Messaging covers DMs. A token issued for one will fail against the other, regardless of how many times you reconnect.",
    },
    {
      question: "Why did my connected account stop working after a few weeks?",
      answer:
        "The token expired or was invalidated. Meta's long-lived tokens lapse after roughly sixty days without refresh, and password changes, revoked app permissions, or newly enabled two-factor authentication all kill tokens. It needs reauthorising — retrying will fail identically every time.",
    },
    {
      question: "Can an AI agent connect my social accounts for me?",
      answer:
        "No. OAuth consent requires a person clicking through a browser consent screen, and that cannot be delegated. Connecting each account is a one-time manual step; publishing, scheduling, and reporting after that can all be automated.",
    },
  ],
  relatedPaths: [
    { href: "/features", label: "Supported platforms" },
    { href: "/features/instagram-scheduler", label: "Instagram scheduler" },
    { href: "/features/tiktok-scheduler", label: "TikTok scheduler" },
  ],
  relatedSlugs: [
    "why-scheduled-posts-fail",
    "managing-multiple-social-accounts",
    "social-media-posting-api-guide",
  ],
};
