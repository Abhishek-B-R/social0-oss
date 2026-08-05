/**
 * PLACEHOLDER social proof — replace metrics, quotes, names, and roles
 * with real customer data before shipping.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useLandingMode, type LandingMode } from "./landing-mode";

type Metric = { value: string; label: string };
type Testimonial = {
  quote: string;
  name: string;
  role: string;
  initials: string;
};

const metrics: Metric[] = [
  { value: "2,400+", label: "creators posting" },
  { value: "18 min", label: "avg. time saved / day" },
  { value: "9", label: "platforms, one click" },
];

const byMode: Record<
  LandingMode,
  {
    eyebrow: string;
    headline: string;
    testimonials: Testimonial[];
  }
> = {
  normal: {
    eyebrow: "Trusted by people who ship",
    headline: "Less tab-switching. More posting.",
    testimonials: [
      {
        quote:
          "I used to burn 40 minutes every launch just copy-pasting. Now I hit publish once and I’m done before coffee cools.",
        name: "Maya Chen",
        role: "Indie founder · Product Hunt launches",
        initials: "MC",
      },
      {
        quote:
          "We manage six client brands. Social0 replaced three tabs and a messy Notion checklist. Clients just see posts going out.",
        name: "Jordan Blake",
        role: "Agency owner · Northline Studio",
        initials: "JB",
      },
      {
        quote:
          "Connected Claude via MCP for product updates — same dashboard my team already uses. No second tool.",
        name: "Priya Nair",
        role: "Developer · AI-native SaaS",
        initials: "PN",
      },
    ],
  },
  agent: {
    eyebrow: "Trusted by people who ship with agents",
    headline: "Less dashboards. More shipping.",
    testimonials: [
      {
        quote:
          "Connected Claude via MCP and it schedules our product updates while I sleep. Same dashboard my team already uses.",
        name: "Priya Nair",
        role: "Developer · AI-native SaaS",
        initials: "PN",
      },
      {
        quote:
          "I ask ChatGPT to draft the launch thread and Social0 ships it to X, LinkedIn, and Bluesky. Feels like cheating.",
        name: "Maya Chen",
        role: "Indie founder · Product Hunt launches",
        initials: "MC",
      },
      {
        quote:
          "Our agency bots post client updates through the API. Status shows up in Social0 — clients never see the wiring.",
        name: "Jordan Blake",
        role: "Agency owner · Northline Studio",
        initials: "JB",
      },
    ],
  },
};

export function SocialProofSection() {
  const { mode } = useLandingMode();
  const { eyebrow, headline, testimonials } = byMode[mode];

  return (
    <section
      id="stories"
      className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      aria-label="Customer stories"
    >
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col items-center gap-3"
            >
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {eyebrow}
              </p>
              <h2 className="max-w-md font-sans text-[clamp(28px,4vw,40px)] font-bold leading-tight text-foreground dark:text-white">
                {headline}
              </h2>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mb-10 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border dark:border-white/10">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="bg-background px-4 py-6 text-center dark:bg-[#111111] sm:px-6 sm:py-8"
              >
                <div className="font-serif text-[clamp(26px,3.5vw,36px)] tracking-tight text-foreground">
                  {m.value}
                </div>
                <div className="mt-1 text-[12px] text-muted-foreground sm:text-[13px]">
                  {m.label}
                </div>
              </div>
            ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`quotes-${mode}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="grid gap-4 md:grid-cols-3"
          >
            {testimonials.map((t) => (
              <figure
                key={`${mode}-${t.name}`}
                className="group relative overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-[#1A1A1A]"
              >
                <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-5 dark:border-white/5 dark:bg-[#111111] sm:p-6">
                  <blockquote className="flex-1 text-[14px] leading-relaxed text-foreground/90 sm:text-[15px]">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-border/60 pt-5 dark:border-white/5">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/10 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400"
                      aria-hidden
                    >
                      {t.initials}
                    </span>
                    <div className="min-w-0 text-left">
                      <div className="truncate text-[14px] font-semibold text-foreground">
                        {t.name}
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {t.role}
                      </div>
                    </div>
                  </figcaption>
                </div>
              </figure>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
