import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { AnimatePresence, motion } from "framer-motion";
import { GridBackground } from "./GridBackground";
import { PlatformStrip } from "./PlatformStrip";
import { AgentLogoStrip } from "./AgentLogoStrip";
import { useLandingMode } from "./landing-mode";

const HeroIsoAnimation = lazy(() =>
  import("./hero-illustrations/HeroIsoAnimation").then((m) => ({
    default: m.HeroIsoAnimation,
  })),
);

const HeroFloatingBrand = lazy(() =>
  import("./hero-illustrations/HeroFloatingBrand").then((m) => ({
    default: m.HeroFloatingBrand,
  })),
);

function developersHref(pathname: string) {
  return pathname === "/home" ? "/home#developers" : "/#developers";
}

const copy = {
  normal: {
    eyebrow: "Write once · Publish everywhere",
    titleBefore: "Grow and manage your",
    titleEm: "socials",
    titleAfter: " efficiently.",
    sub: "Schedule and publish to 9 platforms from one place — with tools that keep working after you hit post.",
  },
  agent: {
    eyebrow: "Agents on autopilot",
    titleBefore: "Run your socials on autopilot with",
    titleEm: "AI agents",
    titleAfter: ".",
    sub: "Point Cursor, Claude, or your stack at Social0 — agents draft, schedule, and publish for you.",
  },
} as const;

/**
 * First screen = ~90% hero + ~10% Publishes-to.
 * Header sits sticky above; section fills remaining viewport.
 */
export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const { pathname } = useLocation();
  const { mode } = useLandingMode();
  const c = copy[mode];

  return (
    <section className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-x-hidden sm:min-h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)] lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-hidden">
      <GridBackground />

      {/* ~90% — value prop + iso art */}
      <div className="relative z-10 flex min-h-0 flex-[9] flex-col justify-center">
        <div className="relative mx-auto w-full max-w-[1440px] px-4 sm:w-[92%] sm:px-6 lg:w-[90%] lg:px-8 xl:px-10">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10 xl:gap-14 lg:min-h-[min(620px,calc(90dvh-7rem))]">
            <div className="relative z-20 mx-auto max-w-[540px] text-center lg:mx-0 lg:max-w-none lg:text-left">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                >
                  <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 sm:mb-5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#34d399] dark:bg-emerald-400" />
                    {c.eyebrow}
                  </p>

                  <h1 className="mb-4 font-serif text-[clamp(36px,5.5vw,64px)] leading-[1.05] tracking-tight text-foreground sm:mb-5">
                    {c.titleBefore}{" "}
                    <em className="italic text-emerald-700 dark:text-emerald-400">
                      {c.titleEm}
                    </em>
                    {c.titleAfter}
                  </h1>

                  <p className="mb-7 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:mb-8 sm:text-[17px] lg:mx-0">
                    {c.sub}
                  </p>
                </motion.div>
              </AnimatePresence>

              <motion.div
                className="flex flex-col items-center gap-3.5 lg:items-start"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.18,
                  ease: [0.23, 1, 0.32, 1],
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-4 lg:justify-start">
                  <Link
                    href={signedIn ? "/dashboard" : "/auth"}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-emerald-500 px-7 py-3.5 text-[15px] font-semibold text-[#04140c] shadow-[0_0_32px_rgba(16,185,129,0.28)] transition-transform duration-150 hover:bg-emerald-400 active:scale-[0.97] dark:shadow-[0_0_32px_rgba(16,185,129,0.38)] sm:w-auto sm:text-[16px]"
                  >
                    {signedIn ? "Go to dashboard" : "Start posting free"}
                    <span aria-hidden="true">→</span>
                  </Link>
                  <Link
                    href={developersHref(pathname)}
                    className="inline-flex items-center justify-center gap-2 text-[14px] text-muted-foreground transition-colors hover:text-foreground sm:text-[15px]"
                  >
                    REST API, MCP & CLI
                    <span
                      aria-hidden
                      className="text-emerald-600 dark:text-emerald-400"
                    >
                      ↗
                    </span>
                  </Link>
                </div>
                <p className="text-[12px] text-muted-foreground sm:text-[13px]">
                  Start free · No credit card · Cancel anytime
                </p>
              </motion.div>
            </div>

            {/* Right: large iso — absolute so unscaled box doesn't blow the row */}
            <div className="relative mx-auto hidden h-[280px] w-full max-w-[640px] sm:block sm:h-[340px] md:h-[400px] lg:mx-0 lg:h-full lg:min-h-[520px] lg:max-w-none xl:min-h-[580px]">
              {mode === "agent" ? (
                <AgentLogoStrip className="absolute left-0 right-0 top-0 z-50 px-1" />
              ) : null}
              <Suspense
                fallback={
                  <div
                    className="absolute inset-0 rounded-2xl border border-border bg-muted/30"
                    aria-hidden
                  />
                }
              >
                <div
                  className={`absolute inset-0 overflow-visible ${
                    mode === "agent" ? "pt-10 sm:pt-11" : ""
                  }`}
                >
                  <div className="origin-top scale-[0.55] sm:scale-[0.62] md:scale-[0.7] lg:origin-top-right lg:scale-[0.72] xl:scale-[0.82] 2xl:scale-[0.88]">
                    <Suspense fallback={null}>
                      <HeroFloatingBrand className="absolute right-2 top-2 z-40 drop-shadow-[0_8px_24px_rgba(16,185,129,0.35)] sm:right-8 sm:top-0 lg:right-4" />
                    </Suspense>
                    <HeroIsoAnimation mode={mode} />
                  </div>
                </div>
              </Suspense>
            </div>

            {/* Mobile iso — visible under copy */}
            <div className="relative mx-auto w-full max-w-[420px] overflow-visible sm:hidden">
              {mode === "agent" ? (
                <AgentLogoStrip className="mb-3 px-1" />
              ) : null}
              <div className="relative h-[240px] w-full">
                <Suspense fallback={null}>
                  <div className="absolute left-1/2 top-0 origin-top -translate-x-1/2 scale-[0.42]">
                    <HeroFloatingBrand className="absolute -right-2 top-0 z-40" />
                    <HeroIsoAnimation mode={mode} />
                  </div>
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ~10% — Publishes to */}
      <div className="relative z-10 flex-[1] shrink-0">
        <PlatformStrip compact />
      </div>
    </section>
  );
}
