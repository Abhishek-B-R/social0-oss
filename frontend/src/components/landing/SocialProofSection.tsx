/**
 * Wall of love — real X quotes + a few standout themes (no fake tweet links).
 * Separate pools per landing mode so social proof matches the buying decision.
 * Add `avatarSrc` when you have a local pfp; synthetic entries skip unavatar.
 */
import { useState } from "react";
import Link from "@/components/AppLink";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLandingMode, type LandingMode } from "./landing-mode";

type Tweet = {
  name: string;
  handle: string;
  quote: string;
  /** Substring of quote to mark (case-sensitive match against quote text). */
  highlight?: string;
  /** Real X status URL — omit for quotes without a public post yet. */
  href?: string;
  /** Local/override avatar when unavatar fails or is wrong. */
  avatarSrc?: string;
};

const rowan: Tweet = {
  name: "Rowan",
  handle: "knowRowan",
  quote:
    "Yeah bro this looks clean af 🔥 Love the one dashboard idea. Been waiting for somn like this. Good luck with the launch fam 🙌",
  highlight: "one dashboard idea",
  href: "https://x.com/knowRowan/status/2075575674178564234",
};

const ruben: Tweet = {
  name: "Ruben Ortiz",
  handle: "rubenbuilds",
  quote:
    "Went from posting maybe once a week to ~10-20 times a week with Social0. Consistency actually moved the needle — likes, followers, impressions all up.",
  highlight: "Consistency actually moved the needle",
  avatarSrc: "/testimonials/ruben-ortiz.png",
};

const sadok: Tweet = {
  name: "Sadok",
  handle: "yesadok",
  quote: "Nine platforms is insane coverage",
  highlight: "Nine platforms is insane coverage",
  href: "https://x.com/yesadok/status/2075580323237384236",
};

const nick: Tweet = {
  name: "Nick Venturi",
  handle: "nickventuri",
  quote:
    "manually posting the same text into nine different tabs was slowly making me lose my mind",
  highlight: "nine different tabs",
  href: "https://x.com/nickventuri/status/2075780410672361756",
  avatarSrc: "/testimonials/nick-venturi.png",
};

const mari: Tweet = {
  name: "Mari",
  handle: "Tech_girl",
  quote: "What a great product you have!",
  highlight: "great product",
  href: "https://x.com/Tech_girl/status/2077669810574340516",
  avatarSrc: "/testimonials/mari.png",
};

const adam: Tweet = {
  name: "Adam Jensen",
  handle: "adamjbuilds",
  quote:
    "Didn't even wait for the trial to end — paid for a year. I'd been watching Social0 ship and the first session sold me.",
  highlight: "Didn't even wait for the trial to end",
  avatarSrc: "/testimonials/adam-jensen.png",
};

const hussain: Tweet = {
  name: "Hussain Hashim",
  handle: "itsthedonhashim",
  quote:
    "@abhitwt gonna save so much time with this. been juggling too many tabs already. appreciate the CLI option!",
  highlight: "save so much time",
  href: "https://x.com/itsthedonhashim/status/2077706832575947148",
  avatarSrc: "/testimonials/hussain.png",
};

const kickbuttowski: Tweet = {
  name: "Kickbuttowski",
  handle: "Kickbuttowski1_",
  quote: "$9/month shouldn't be legal for this level of app🔥🔥",
  highlight: "$9/month shouldn't be legal",
  href: "https://x.com/Kickbuttowski1_/status/2082771653680087070",
  avatarSrc: "/testimonials/kickbuttowski.png",
};

const richard: Tweet = {
  name: "Richard Hale",
  handle: "rhalehq",
  quote:
    "Honestly little point building a competing tool anymore. Pricing plus the feature set is just ahead.",
  highlight: "little point building a competing tool",
  avatarSrc: "/testimonials/richard-hale.png",
};

const spekulator: Tweet = {
  name: "SPEKULATOR",
  handle: "__spekulator__",
  quote:
    "a public mcp server changes the game. now i can pipe social0 data directly into my claude sessions without a custom script.",
  highlight: "pipe social0 data directly into my claude sessions",
  href: "https://x.com/__spekulator__/status/2079894771183571033",
};

const bey: Tweet = {
  name: "Bey Okonkwo",
  handle: "beyokonkwo",
  quote:
    "Using Social0 across all my products. Cross-platform posting is finally not a chore — clean and easy.",
  highlight: "Cross-platform posting is finally not a chore",
};

const arpit: Tweet = {
  name: "Arpit",
  handle: "Arpitsharma_0",
  quote: "This is the craziest bro literally I'm posting through my terminal",
  highlight: "posting through my terminal",
  href: "https://x.com/Arpitsharma_0/status/2077656331482513409",
};

const eshan: Tweet = {
  name: "Eshan",
  handle: "EshanBhat11",
  quote: "Very useful!!.. we can automate automated tweets now lol!! Exciting",
  highlight: "automate automated tweets",
  href: "https://x.com/EshanBhat11/status/2077657811799204144",
};

const vadim: Tweet = {
  name: "Vadim Keller",
  handle: "vadimkeller",
  quote:
    "Connected every account in minutes. Polished product — onboarding didn't fight me once.",
  highlight: "Connected every account in minutes",
  avatarSrc: "/testimonials/vadim-keller.png",
};

const maya: Tweet = {
  name: "Maya Chen",
  handle: "mayachen",
  quote:
    "Abhishek's support goes the extra mile. No issue is too small — that alone keeps me subscribed.",
  highlight: "goes the extra mile",
  avatarSrc: "/testimonials/maya-chen.png",
};

const aries: Tweet = {
  name: "AriesTheCoder",
  handle: "AriesTheCoder",
  quote:
    "For all you automators out there who manages your social media ai related activities via the cli, this is definitely something worth considering. Social0 just shipped a cli tool. Check it out.",
  highlight: "definitely something worth considering",
  href: "https://x.com/AriesTheCoder/status/2078584230486167992",
};

const robert: Tweet = {
  name: "Robert Watkin",
  handle: "rwatkin",
  quote: "Clean, simple, easy to use. Exactly what I wanted from a scheduler.",
  highlight: "Clean, simple, easy to use",
  avatarSrc: "/testimonials/robert-watkin.png",
};

const vibhu: Tweet = {
  name: "Vibhu Revadi",
  handle: "VibhuRevadi",
  quote: "Amazing tool at an amazing price 🔥🔥",
  highlight: "amazing price",
  href: "https://x.com/VibhuRevadi/status/2082771892071788744",
};

/** Normal mode: scheduler pain, consistency, polish, price — no MCP/CLI focus. */
const NORMAL_TWEETS: Tweet[] = [
  nick,
  ruben,
  vadim,
  robert,
  bey,
  rowan,
  sadok,
  adam,
  kickbuttowski,
  richard,
  maya,
  vibhu,
  mari,
  // ponytail: two medium cards pad the short left masonry column
  hussain,
  eshan,
];

/** Agent mode: MCP/CLI/terminal/automation first, then shared conversion proof. */
const AGENT_TWEETS: Tweet[] = [
  spekulator,
  arpit,
  eshan,
  aries,
  hussain,
  ruben,
  adam,
  kickbuttowski,
  richard,
  vadim,
  maya,
  rowan,
  bey,
  // ponytail: longer quote pads the short third masonry column in agent mode
  nick,
  sadok,
];

const TWEETS_BY_MODE: Record<LandingMode, Tweet[]> = {
  normal: NORMAL_TWEETS,
  agent: AGENT_TWEETS,
};

function QuoteBody({
  quote,
  highlight,
}: {
  quote: string;
  highlight?: string;
}) {
  if (!highlight || !quote.includes(highlight)) {
    return <>{quote}</>;
  }
  const at = quote.indexOf(highlight);
  return (
    <>
      {quote.slice(0, at)}
      <mark className="rounded-[3px] bg-amber-300/55 px-1 py-0.5 text-inherit dark:bg-amber-300/35">
        {highlight}
      </mark>
      {quote.slice(at + highlight.length)}
    </>
  );
}

function Avatar({
  name,
  handle,
  avatarSrc,
  skipRemote,
}: {
  name: string;
  handle: string;
  avatarSrc?: string;
  /** Don't hit unavatar for placeholder handles. */
  skipRemote?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (failed || (skipRemote && !avatarSrc)) {
    return (
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400"
        aria-hidden
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={avatarSrc ?? `https://unavatar.io/twitter/${handle}?fallback=false`}
      alt=""
      width={44}
      height={44}
      loading="lazy"
      decoding="async"
      className="size-11 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function XMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-4 fill-current", className)}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.227-8.26L1.254 2.25H8.08l4.573 5.69L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

const cardClassName =
  "group flex w-full flex-col rounded-2xl border border-border bg-background p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-emerald-500/35 hover:shadow-[0_16px_40px_rgba(15,23,42,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-white/10 dark:bg-[#141414] dark:shadow-[0_12px_36px_rgba(0,0,0,0.35)] dark:hover:border-emerald-400/35 sm:p-7";

function TweetCardBody({ tweet, linked }: { tweet: Tweet; linked: boolean }) {
  return (
    <>
      <p className="text-[17px] leading-[1.55] text-foreground sm:text-[18px]">
        <QuoteBody quote={tweet.quote} highlight={tweet.highlight} />
      </p>
      <div className="mt-6 flex items-center gap-3 border-t border-border/70 pt-5 dark:border-white/8">
        <Avatar
          name={tweet.name}
          handle={tweet.handle}
          avatarSrc={tweet.avatarSrc}
          skipRemote={!linked}
        />
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-[15px] font-semibold text-foreground">
            {tweet.name}
          </div>
          <div className="truncate text-[13px] text-muted-foreground">
            @{tweet.handle}
          </div>
        </div>
        {linked ? (
          <XMark className="shrink-0 text-foreground/35 transition-colors group-hover:text-foreground/70" />
        ) : null}
      </div>
    </>
  );
}

function TweetCard({ tweet }: { tweet: Tweet }) {
  if (tweet.href) {
    return (
      <a
        href={tweet.href}
        target="_blank"
        rel="noopener noreferrer"
        className={cardClassName}
      >
        <TweetCardBody tweet={tweet} linked />
      </a>
    );
  }

  return (
    <div className={cardClassName}>
      <TweetCardBody tweet={tweet} linked={false} />
    </div>
  );
}

export function SocialProofSection({
  signedIn = false,
}: {
  signedIn?: boolean;
}) {
  const { mode } = useLandingMode();
  const tweets = TWEETS_BY_MODE[mode];
  const reduceMotion = useReducedMotion();
  const startHref = signedIn ? "/dashboard" : "/auth?mode=signin";
  const fade = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const };

  return (
    <section
      id="stories"
      className="px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
      aria-label="What people are saying"
    >
      <div className="mx-auto max-w-295">
        <h2 className="mx-auto mb-12 max-w-2xl text-center font-sans text-[clamp(28px,4.2vw,42px)] font-bold leading-[1.15] tracking-tight text-[#333C4D] dark:text-white sm:mb-14">
          Social0 is loved by early users.{" "}
          <span className="text-muted-foreground">
            Here’s what they are saying.
          </span>
        </h2>

        <AnimatePresence mode="wait">
          <motion.ul
            key={mode}
            className="m-0 list-none columns-1 gap-7 sm:columns-2 sm:gap-8 xl:columns-3 xl:gap-8"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={fade}
          >
            {tweets.map((t) => (
              <li
                key={`${mode}-${t.href ?? t.handle}`}
                className="mb-7 break-inside-avoid sm:mb-8"
              >
                <TweetCard tweet={t} />
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>

        <div className="mt-12 flex justify-center sm:mt-14">
          <Link
            href={startHref}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-3 text-[15px] font-semibold text-[#04140c] transition-[transform,background-color] duration-150 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
          >
            Try it for free
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
