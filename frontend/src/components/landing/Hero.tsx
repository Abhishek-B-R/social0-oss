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
    sub: "Point ChatGPT, Claude, or your stack at Social0 — agents draft, schedule, and publish for you.",
  },
} as const;

/**
 * First viewport below sticky header:
 *   ~90% hero (copy + iso), vertically centered
 *   ~10% Publishes-to strip, pinned to bottom
 * Iso is clipped inside a flex child so it cannot paint over the strip.
 */
export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const { pathname } = useLocation();
  const { mode } = useLandingMode();
  const c = copy[mode];

  return (
    <section className="relative flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden sm:h-[calc(100dvh-4rem)]">
      <GridBackground />

      {/* ~90% — value prop + iso, fills leftover height above strip */}
      <div className="relative z-10 flex min-h-0 flex-[1_1_0%] overflow-x-hidden overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[1440px] items-stretch px-4 py-5 sm:w-[92%] sm:px-6 sm:py-6 lg:w-[90%] lg:px-8 lg:py-5 xl:px-10">
          <div className="grid w-full gap-6 lg:h-full lg:grid-cols-2 lg:items-stretch lg:gap-10 xl:gap-14">
            <div className="relative z-20 mx-auto flex max-w-[540px] flex-col justify-center text-center lg:mx-0 lg:max-w-none lg:text-left">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                >
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 sm:mb-4">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#34d399] dark:bg-emerald-400" />
                    {c.eyebrow}
                  </p>

                  <h1 className="mb-3 font-serif text-[clamp(34px,5.2vw,64px)] leading-[1.05] tracking-tight text-foreground sm:mb-4">
                    {c.titleBefore}{" "}
                    <em className="italic text-emerald-700 dark:text-emerald-400">
                      {c.titleEm}
                    </em>
                    {c.titleAfter}
                  </h1>

                  <p className="mb-6 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:mb-7 sm:text-[17px] lg:mx-0">
                    {c.sub}
                  </p>
                </motion.div>
              </AnimatePresence>

              <motion.div
                className="flex flex-col items-center gap-3 lg:items-start"
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

            {/* Desktop/tablet iso — stretches full column height, clipped above strip */}
            <div className="relative mx-auto hidden h-full min-h-0 w-full max-w-[640px] flex-col overflow-hidden sm:flex lg:mx-0 lg:max-w-none">
              {mode === "agent" ? (
                <AgentLogoStrip className="mb-2 shrink-0 px-1" />
              ) : null}
              <div className="relative isolate min-h-0 w-full flex-1 overflow-hidden">
                <Suspense fallback={null}>
                  <HeroFloatingBrand className="absolute right-2 top-2 z-20 drop-shadow-[0_8px_24px_rgba(16,185,129,0.35)] sm:right-3 sm:top-3 lg:right-4" />
                </Suspense>
                <Suspense fallback={null}>
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="origin-top scale-[0.58] sm:scale-[0.66] md:scale-[0.72] lg:origin-top-right lg:scale-[0.76] xl:scale-[0.84] 2xl:scale-[0.9]">
                      <HeroIsoAnimation mode={mode} />
                    </div>
                  </div>
                </Suspense>
              </div>
            </div>

            {/* Mobile iso */}
            <div className="relative mx-auto w-full max-w-[420px] sm:hidden">
              {mode === "agent" ? (
                <AgentLogoStrip className="mb-2 px-1" />
              ) : null}
              <div className="relative isolate h-[220px] w-full overflow-hidden">
                <Suspense fallback={null}>
                  <HeroFloatingBrand className="absolute right-1 top-2 z-20" />
                </Suspense>
                <Suspense fallback={null}>
                  <div className="absolute left-1/2 top-0 origin-top -translate-x-1/2 scale-[0.4]">
                    <HeroIsoAnimation mode={mode} />
                  </div>
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ~10% — pinned to bottom of first viewport */}
      <div className="relative z-20 shrink-0">
        <PlatformStrip compact />
      </div>
    </section>
  );
}
