import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GridBackground } from "./GridBackground";
import { PlatformStrip } from "./PlatformStrip";
import { AgentHappyCustomers, AgentLogoStrip } from "./AgentLogoStrip";
import { useLandingMode, type LandingMode } from "./landing-mode";

const HeroIsoAnimation = lazy(() =>
  import("./hero-illustrations/HeroIsoAnimation").then((m) => ({
    default: m.HeroIsoAnimation,
  })),
);

function developersHref(pathname: string) {
  return pathname === "/home" ? "/home#developers" : "/#developers";
}

const copy = {
  normal: {
    titleBefore: "Post to all your social accounts from",
    titleEm: "one dashboard",
    titleAfter: ".",
    clarifier:
      "Create once. Publish or schedule across X, Instagram, LinkedIn, YouTube, TikTok, and more — from one place.",
    // PLACEHOLDER count — replace before shipping
    proof: "Trusted by 2,400+ creators",
  },
  agent: {
    titleBefore: "Run your social accounts on autopilot with",
    titleEm: "AI agents.",
    titleAfter: "",
    clarifier:
      "Plan, generate, and schedule posts to 9+ social media platforms. Then manage all this content in the dashboard if needed.",
    clarifierBold:
      "Use any agent: OpenClaw, Hermes, ChatGPT, Codex, Claude, Cursor, etc.",
    proof: "Works with ChatGPT, Claude & OpenClaw",
  },
} as const;

/** Fit iso to the visible stage — width + height (cqh alone fails on short flex rows). */
function HeroIsoStage({ mode }: { mode: LandingMode }) {
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const fit = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(
        0,
        Math.min(rect.width, window.innerWidth - rect.left),
      );
      const h = Math.max(
        0,
        Math.min(rect.height, window.innerHeight - rect.top - 12),
      );
      if (w < 8 || h < 8) return;

      // Leave bottom air so cubes never collide with the strip under the stage
      const scale = Math.min((w * 0.98) / 860, (h * 0.78) / 720, 1);
      el.style.setProperty("--iso-scale", String(Math.max(0.26, scale)));
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="landing-hero-iso relative isolate min-h-0 w-full flex-1 overflow-hidden bg-transparent contain-[paint]"
    >
      <Suspense fallback={null}>
        <div className="landing-hero-iso-scale xl:-mt-5" aria-hidden>
          <HeroIsoAnimation mode={mode} />
        </div>
      </Suspense>
    </div>
  );
}

/**
 * Desktop (lg+): 2-col + iso. Phone/tablet: copy + CTA only — no iso
 * (the stacked SVG can't be cropped reliably and was stretching the page).
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
    <section className="landing-hero relative flex flex-col overflow-x-hidden">
      <GridBackground />

      <div className="landing-hero-main relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-360 min-h-0 flex-1 flex-col justify-center px-5 py-6 sm:w-[92%] sm:px-6 sm:py-8 lg:w-[90%] lg:px-8 lg:py-3 xl:px-10">
          <div className="grid w-full min-w-0 items-center gap-6 lg:h-full lg:min-h-0 lg:grid-cols-2 lg:items-stretch lg:gap-6 xl:gap-8">
            <div className="relative z-20 mx-auto flex w-full min-w-0 max-w-135 flex-col justify-center text-center lg:mx-0 lg:max-w-none lg:w-[120%] xl:w-[125%] lg:text-left">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                  transition={fade}
                >
                  <h1 className="mb-3 max-w-full font-serif font-bold text-[clamp(32px,8vw,56px)] leading-[1.1] tracking-tight text-foreground sm:text-[clamp(36px,5vw,64px)] sm:leading-[1.05] lg:text-[clamp(40px,4.5vw,64px)]">
                    {c.titleBefore}{" "}
                    <em className="italic text-emerald-700 dark:text-emerald-400">
                      {c.titleEm}
                    </em>
                    {c.titleAfter}
                  </h1>

                  <p className="mx-auto mb-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:mb-6 sm:text-[17px] lg:mx-0">
                    {c.clarifier}
                    <br />
                    {"clarifierBold" in c && c.clarifierBold ? (
                      <>
                        <br />
                        <span className="font-extrabold text-foreground">
                          {c.clarifierBold.split(":")[0]}:
                        </span>
                        <span className="font-normal text-foreground">
                          {c.clarifierBold.split(":")[1]}
                        </span>
                      </>
                    ) : null}
                  </p>

                  {/* <ul className="mx-auto mb-6 flex max-w-lg flex-col gap-2 text-left sm:mb-7 lg:mx-0">
                    {c.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2.5 text-[13px] leading-snug text-muted-foreground sm:text-[14px]"
                      >
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                        {b}
                      </li>
                    ))}
                  </ul> */}
                </motion.div>
              </AnimatePresence>

              <motion.div
                className="flex flex-col items-center gap-3 lg:items-start"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        duration: 0.4,
                        delay: 0.12,
                        ease: [0.23, 1, 0.32, 1],
                      }
                }
              >
                <Link
                  href={signedIn ? "/dashboard" : "/auth"}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-7 py-3.5 text-[15px] font-semibold text-[#04140c] shadow-[0_0_32px_rgba(16,185,129,0.28)] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] dark:shadow-[0_0_32px_rgba(16,185,129,0.38)] sm:w-auto sm:text-[16px]"
                >
                  {signedIn ? "Go to dashboard" : "Get started for free"}
                  <span aria-hidden="true">→</span>
                </Link>
                <AgentHappyCustomers className="mt-1" />
                <p className="text-[12px] text-muted-foreground sm:text-[13px]">
                  {c.proof} · 10 free posts · No credit card
                </p>
                {mode === "agent" ? (
                  <Link
                    href={developersHref(pathname)}
                    className="text-[13px] text-muted-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                  >
                    See API, MCP &amp; CLI
                  </Link>
                ) : null}
              </motion.div>
            </div>

            <div className="landing-hero-iso-col relative mx-auto hidden min-h-0 min-w-0 w-full flex-col overflow-hidden bg-transparent lg:flex lg:h-full">
              <HeroIsoStage mode={mode} />
            </div>
          </div>
        </div>
        <AgentLogoStrip className="border-0 bg-transparent py-3 sm:py-3.5" />

        {/* Pills + Publishes to — pinned to bottom of the hero viewport */}
        <div className="relative z-20 mt-auto shrink-0 border-t border-border bg-muted/80 dark:bg-[#111111]">
          <PlatformStrip
            compact
            className="border-0 border-t border-border/60 bg-transparent dark:bg-transparent"
          />
        </div>
      </div>
    </section>
  );
}
