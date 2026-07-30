import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { motion } from "framer-motion";
import { GridBackground } from "./GridBackground";
import { PlatformStrip } from "./PlatformStrip";

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

export function Hero({ signedIn = false }: { signedIn?: boolean }) {
  const { pathname } = useLocation();

  return (
    <section className="relative overflow-x-hidden pt-10 sm:pt-14 lg:pt-16">
      <GridBackground />

      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-4 xl:gap-6">
          <div className="relative z-20 mx-auto max-w-[420px] text-center lg:mx-0 lg:text-left">
            <motion.p
              className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#34d399] dark:bg-emerald-400" />
              Write once · Publish everywhere
            </motion.p>

            <motion.h1
              className="mb-3 font-serif text-[clamp(32px,5.2vw,52px)] leading-[1.08] tracking-tight text-foreground"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.55,
                delay: 0.06,
                ease: [0.23, 1, 0.32, 1],
              }}
            >
              Grow and manage your{" "}
              <em className="italic text-emerald-700 dark:text-emerald-400">
                socials
              </em>
              , smarter.
            </motion.h1>

            <motion.p
              className="mb-5 text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.12,
                ease: [0.23, 1, 0.32, 1],
              }}
            >
              Schedule and publish to 9 platforms from one place — with tools
              that keep working after you hit post.
            </motion.p>

            <motion.div
              className="flex flex-col items-center gap-3 lg:items-start"
              initial={{ opacity: 0, y: 10 }}
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-emerald-500 px-6 py-3 text-[15px] font-semibold text-[#04140c] shadow-[0_0_28px_rgba(16,185,129,0.25)] transition-transform duration-200 hover:scale-[1.02] hover:bg-emerald-400 active:scale-[0.97] dark:shadow-[0_0_28px_rgba(16,185,129,0.35)] sm:w-auto"
                >
                  {signedIn ? "Go to dashboard" : "Start posting free"}
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href={developersHref(pathname)}
                  className="inline-flex items-center justify-center gap-2 text-[14px] text-muted-foreground transition-colors hover:text-foreground"
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
              <p className="text-[12px] text-muted-foreground">
                Start free · No credit card · Cancel anytime
              </p>
            </motion.div>
          </div>

          <div className="relative mx-auto w-full max-w-[520px] overflow-visible lg:mx-0 lg:justify-self-end">
            <Suspense
              fallback={
                <div
                  className="h-[260px] w-full rounded-2xl border border-border bg-muted/40 sm:h-[280px]"
                  aria-hidden
                />
              }
            >
              {/* Cap layout height — CSS scale doesn't shrink the box */}
              <div className="relative h-[240px] overflow-visible sm:h-[270px] md:h-[290px] lg:h-[300px] xl:h-[320px]">
                <div className="absolute inset-x-0 top-0 origin-top scale-[0.48] sm:scale-[0.54] md:scale-[0.58] lg:origin-top-right lg:scale-[0.55] xl:scale-[0.6]">
                  <Suspense fallback={null}>
                    <HeroFloatingBrand className="absolute -right-1 top-4 z-40 drop-shadow-[0_8px_24px_rgba(16,185,129,0.35)] sm:right-4 sm:top-0" />
                  </Suspense>
                  <HeroIsoAnimation />
                </div>
              </div>
            </Suspense>
          </div>
        </div>
      </div>

      {/* Publishes-to sits in the first viewport under the hero */}
      <div className="relative z-10 mt-6 sm:mt-8">
        <PlatformStrip compact />
      </div>
    </section>
  );
}
