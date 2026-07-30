import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { motion } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { GridBackground } from "./GridBackground";

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
  // Skip heavy framer iso stack on very small screens for LCP; show scaled peek from md.
  const showIso = useMediaQuery("(min-width: 640px)");

  return (
    <section className="relative overflow-hidden px-4 pb-6 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pt-28">
      <GridBackground />

      <div className="relative z-10 mx-auto w-full max-w-[1400px]">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6 xl:gap-10">
          <div className="relative z-20 max-w-[560px]">
            <motion.p
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              Write once · Publish everywhere
            </motion.p>

            <motion.h1
              className="mb-6 font-serif text-[clamp(40px,7vw,72px)] leading-[1.05] tracking-tight text-white"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: 0.08,
                ease: [0.23, 1, 0.32, 1],
              }}
            >
              Grow and manage your{" "}
              <em className="italic text-emerald-400">socials</em>, smarter.
            </motion.h1>

            <motion.p
              className="mb-9 max-w-[440px] text-[16px] leading-relaxed text-[#A1A1AA] sm:text-[17px]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.55,
                delay: 0.16,
                ease: [0.23, 1, 0.32, 1],
              }}
            >
              Schedule and publish to 9 platforms from one place — with tools
              that keep working after you hit post.
            </motion.p>

            <motion.div
              className="flex flex-col gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.55,
                delay: 0.24,
                ease: [0.23, 1, 0.32, 1],
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <Link
                  href={signedIn ? "/dashboard" : "/auth"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-emerald-500 px-7 py-3.5 text-[15px] font-semibold text-[#04140c] shadow-[0_0_32px_rgba(16,185,129,0.35)] transition-all hover:scale-[1.02] hover:bg-emerald-400 sm:w-auto"
                >
                  {signedIn ? "Go to dashboard" : "Start posting free"}
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href={developersHref(pathname)}
                  className="inline-flex items-center justify-center gap-2 text-[14px] text-[#A1A1AA] transition-colors hover:text-white"
                >
                  REST API, MCP & CLI
                  <span aria-hidden className="text-emerald-400">
                    ↗
                  </span>
                </Link>
              </div>
              <p className="text-[13px] text-[#7D7D87]">
                Start free · No credit card · Cancel anytime
              </p>
            </motion.div>
          </div>

          <div className="relative mx-auto w-full max-w-[720px] lg:mx-0 lg:justify-self-end">
            {showIso ? (
              <Suspense
                fallback={
                  <div
                    className="aspect-[5/4] w-full rounded-2xl border border-white/5 bg-white/[0.02]"
                    aria-hidden
                  />
                }
              >
                <div className="relative origin-top scale-[0.72] sm:scale-[0.8] md:scale-[0.85] lg:origin-top-right lg:scale-[0.78] xl:scale-[0.92] 2xl:scale-100">
                  <Suspense fallback={null}>
                    <HeroFloatingBrand className="absolute -right-2 top-8 z-40 drop-shadow-[0_8px_24px_rgba(16,185,129,0.35)] sm:right-8 sm:top-4" />
                  </Suspense>
                  <HeroIsoAnimation />
                </div>
              </Suspense>
            ) : (
              <div
                className="mx-auto h-40 w-full max-w-sm rounded-xl border border-emerald-500/20 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.15),transparent_70%)]"
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
