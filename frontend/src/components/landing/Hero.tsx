import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GridBackground } from "./GridBackground";
import { PlatformStrip } from "./PlatformStrip";
import { AgentLogoStrip } from "./AgentLogoStrip";
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
    eyebrow: "Write once · Publish everywhere",
    titleBefore: "Post everywhere in",
    titleEm: "seconds",
    titleAfter: ", not hours.",
    clarifier:
      "Create once. Publish or schedule across X, Instagram, LinkedIn, YouTube, TikTok, and more — from one place.",
    // Framework: hero bullets (outcomes, not feature dump)
    bullets: [
      "Publish to 9 platforms in one click",
      "Schedule once — go live everywhere",
      "10 free posts · no credit card",
    ],
    // PLACEHOLDER count — replace before shipping
    proof: "Trusted by 2,400+ creators",
  },
  agent: {
    eyebrow: "Agents on autopilot",
    titleBefore: "Run your social accounts on autopilot with",
    titleEm: "AI agents",
    titleAfter: ".",
    clarifier:
      "Point ChatGPT or Claude at Social0 — agents draft, schedule, and publish through the same pipeline as your dashboard.",
    bullets: [
      "MCP for ChatGPT, Claude & OpenClaw",
      "Same dashboard your team already uses",
      "REST, MCP & CLI included free",
    ],
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

      // Leave bottom air so cubes never collide with Supported by under the stage
      const scale = Math.min((w * 0.92) / 860, (h * 0.68) / 720, 0.92);
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
        <div className="landing-hero-iso-scale" aria-hidden>
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

      <div className="landing-hero-main relative z-10 flex flex-col lg:min-h-0 lg:flex-1">
        <div className="mx-auto flex w-full max-w-360 flex-1 flex-col justify-center px-5 py-8 sm:w-[92%] sm:px-6 sm:py-10 lg:w-[90%] lg:px-8 lg:py-4 xl:px-10">
          <div className="grid w-full min-w-0 items-center gap-8 lg:h-full lg:min-h-0 lg:grid-cols-2 lg:items-stretch lg:gap-8 xl:gap-12">
            <div className="relative z-20 mx-auto flex w-full min-w-0 max-w-135 flex-col justify-center text-center lg:mx-0 lg:max-w-none lg:text-left">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                  transition={fade}
                >
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 sm:mb-4">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#34d399] dark:bg-emerald-400" />
                    {c.eyebrow}
                  </p>

                  <h1 className="mb-3 max-w-full text-balance font-serif text-[clamp(32px,8vw,56px)] leading-[1.1] tracking-tight text-foreground sm:text-[clamp(36px,5vw,64px)] sm:leading-[1.05] lg:text-[clamp(40px,4.5vw,64px)]">
                    {c.titleBefore}{" "}
                    <em className="italic text-emerald-700 dark:text-emerald-400">
                      {c.titleEm}
                    </em>
                    {c.titleAfter}
                  </h1>

                  <p className="mx-auto mb-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:mb-6 sm:text-[17px] lg:mx-0">
                    {c.clarifier}
                  </p>

                  <ul className="mx-auto mb-6 flex max-w-lg flex-col gap-2 text-left sm:mb-7 lg:mx-0">
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
                  </ul>
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
                {/* One primary CTA — secondary is text-only so attention stays on Start free */}
                <Link
                  href={signedIn ? "/dashboard" : "/auth"}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-7 py-3.5 text-[15px] font-semibold text-[#04140c] shadow-[0_0_32px_rgba(16,185,129,0.28)] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] dark:shadow-[0_0_32px_rgba(16,185,129,0.38)] sm:w-auto sm:text-[16px]"
                >
                  {signedIn ? "Go to dashboard" : "Start free"}
                  <span aria-hidden="true">→</span>
                </Link>
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
                {mode === "agent" ? (
                  <AgentLogoStrip className="mt-4 w-full items-center lg:hidden" />
                ) : null}
              </motion.div>
            </div>

            {/* Desktop iso — do not touch iso internals */}
            <div className="landing-hero-iso-col relative mx-auto hidden min-h-0 min-w-0 w-full flex-col overflow-hidden bg-transparent lg:flex lg:h-full">
              <HeroIsoStage mode={mode} />
              {mode === "agent" ? (
                <AgentLogoStrip className="relative z-10 mt-3 shrink-0 items-end" />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-20 shrink-0">
        <PlatformStrip compact />
      </div>
    </section>
  );
}
