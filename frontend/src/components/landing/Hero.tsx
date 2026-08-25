import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GridBackground } from "./GridBackground";
import { PlatformStrip } from "./PlatformStrip";
import { AgentHappyCustomers, AgentLogoStrip } from "./AgentLogoStrip";
import { LandingModeToggle, useLandingMode } from "./landing-mode";

function developersHref(pathname: string) {
  return pathname === "/home" ? "/home#developers" : "/#developers";
}

const copy = {
  normal: {
    titleBefore: "Post to all your social media accounts from ",
    titleMid: "",
    titleEm: "one workspace",
    titleAfter: ".",
    breakBeforeMid: false,
    clarifier:
      "Simple on purpose. Fair and transparent pricing — start free, no card needed, with\u00A0human\u00A0support.",
  },
  agent: {
    titleBefore: "Post to all your social media accounts from ",
    titleMid: "",
    titleEm: "your AI agents",
    titleAfter: ".",
    breakBeforeMid: false,
    clarifier:
      "Plan, generate, review, and schedule with your AI agents. Simple by design, fair pricing, with human support.",
  },
} as const;

/**
 * Centered hero layout:
 * platforms → title → description → CTA → pills → customers → mode switch
 */
export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const { pathname } = useLocation();
  const { mode } = useLandingMode();
  const c = copy[mode];
  const reduceMotion = useReducedMotion();
  const fade = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const };

  return (
    <section className="landing-hero relative overflow-x-hidden">
      <GridBackground />

      <div className="relative z-10 mx-auto flex w-full max-w-270 flex-col items-center px-5 pb-10 pt-12 text-center sm:w-[92%] sm:px-6 sm:pb-12 sm:pt-14 lg:w-[88%] lg:max-w-280 lg:px-8 lg:pb-14 lg:pt-16">
        <PlatformStrip variant="hero" className="mb-9 w-full sm:mb-10" />

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            className="w-full max-w-210"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={fade}
          >
            <h1 className="mx-auto mb-5 font-sans text-[clamp(40px,6.5vw,64px)] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#333C4D] sm:mb-6 sm:leading-[1.05] dark:text-foreground">
              {c.titleBefore}
              {c.breakBeforeMid ? <br /> : null}
              {c.titleMid}
              <em className="not-italic text-emerald-600 dark:text-emerald-400">
                {c.titleEm}
              </em>
              {c.titleAfter}
            </h1>

            <p className="mx-auto mb-9 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:mb-10 sm:text-[17px] sm:leading-[1.55]">
              {c.clarifier}
            </p>
          </motion.div>
        </AnimatePresence>

        <motion.div
          className="flex w-full flex-col items-center gap-6 sm:gap-7"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  duration: 0.4,
                  delay: 0.1,
                  ease: [0.23, 1, 0.32, 1],
                }
          }
        >
          <Link
            href={signedIn ? "/dashboard" : "/auth?mode=signin"}
            className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-9 py-3.5 text-[15px] font-semibold text-[#04140c] shadow-[0_0_32px_rgba(16,185,129,0.28)] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] dark:shadow-[0_0_32px_rgba(16,185,129,0.38)] sm:w-auto sm:text-[16px]"
          >
            {signedIn ? "Go to dashboard" : "Get started for free"}
            <span aria-hidden="true">→</span>
          </Link>

          <AgentLogoStrip className="w-full px-0 py-0" />

          <AgentHappyCustomers />

          <LandingModeToggle />
          {mode === "agent" ? (
            <Link
              href={developersHref(pathname)}
              className="text-[13px] text-muted-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              See API, MCP &amp; CLI docs &#8599;
            </Link>
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}
