import Link from "@/components/AppLink";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HeroTopIllustration } from "./hero-illustrations/HeroIsoTop";
import { useLandingModeOrDefault } from "./landing-mode";

const copy = {
  normal: {
    title: "Ready to post everywhere in seconds?",
    body: "Join 400+ creators who stopped copy-pasting. Start free — no credit card.",
  },
  agent: {
    title: "Ready to let agents post for you?",
    body: "Point ChatGPT or Claude at Social0. Start free — no credit card.",
  },
} as const;

export function FinalCTA({ signedIn = false }: { signedIn?: boolean }) {
  const { mode } = useLandingModeOrDefault();
  const c = copy[mode];
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
      <div className="relative mx-auto max-w-[1120px] overflow-hidden rounded-[28px] border border-emerald-500/20 bg-gradient-to-br from-emerald-600 via-emerald-500 to-[#059669]">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(0,0,0,0.12) 12px, rgba(0,0,0,0.12) 24px)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-16 -top-10 hidden opacity-30 md:block lg:opacity-40"
          aria-hidden
        >
          <div className="origin-top-right scale-[0.55] lg:scale-[0.7]">
            <HeroTopIllustration />
          </div>
        </div>

        <div className="relative z-10 px-8 py-16 text-center sm:px-12 sm:py-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.22, ease: [0.23, 1, 0.32, 1] }
              }
            >
              <h2 className="mb-4 font-serif text-[clamp(32px,5vw,52px)] leading-tight tracking-tight text-white">
                {c.title}
              </h2>
              <p className="mx-auto mb-8 max-w-md text-[16px] leading-relaxed text-white/80">
                {c.body}
              </p>
            </motion.div>
          </AnimatePresence>
          <Link
            href={signedIn ? "/dashboard" : "/auth?mode=signin"}
            className="inline-flex min-h-12 items-center gap-2 rounded-[11px] bg-white px-8 py-3.5 text-[15px] font-semibold text-emerald-700 transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-600 active:scale-[0.97]"
          >
            {signedIn ? "Go to dashboard" : "Start free"}
            <span aria-hidden="true">→</span>
          </Link>
          <p className="mt-4 text-[12px] text-white/65">
            Free to start · Cancel anytime · Not happy? Email us — we&apos;ll
            make it right
          </p>
        </div>
      </div>
    </section>
  );
}
