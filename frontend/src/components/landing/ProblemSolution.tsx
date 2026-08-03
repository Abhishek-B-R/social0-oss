import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useLandingMode, type LandingMode } from "./landing-mode";

const byMode: Record<
  LandingMode,
  {
    headline: string;
    /** PAS agitation — cost of the pain, one line */
    agitation: string;
    problemTitle: string;
    solutionTitle: string;
    problem: string[];
    solution: string[];
  }
> = {
  normal: {
    headline: "Stop managing tabs. Start publishing.",
    agitation:
      "Every launch burns 20–40 minutes of copy-paste — and one missed platform can kill the window.",
    problemTitle: "Without Social0",
    solutionTitle: "With Social0",
    problem: [
      "Copy-paste the same post into nine apps",
      "Miss a platform and lose the launch window",
      "No single place to see what shipped",
      "Scheduling tools that stop at the UI",
    ],
    solution: [
      "Write once — publish or schedule everywhere",
      "Parallel publish to all 9 platforms",
      "One calendar for drafts, scheduled, and live",
      "Same engine for dashboard, API, MCP & CLI",
    ],
  },
  agent: {
    headline: "Stop opening schedulers. Let agents ship.",
    agitation:
      "Your agent drafts in seconds — then you spend an hour wiring OAuth and uploads by hand.",
    problemTitle: "Without Social0",
    solutionTitle: "With Social0",
    problem: [
      "Agents can write — but can’t publish securely",
      "Custom OAuth + upload glue for every network",
      "No shared status between agent and team",
      "Dashboard and agent stack feel like two products",
    ],
    solution: [
      "Point ChatGPT or Claude at Social0 via MCP",
      "Agents draft, schedule, and publish for you",
      "Every action lands in the same dashboard",
      "REST, MCP, and CLI — one encrypted pipeline",
    ],
  },
};

function SideCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "problem" | "solution";
}) {
  const isSolution = tone === "solution";
  return (
    <div
      className={`rounded-[28px] border p-1.5 ${
        isSolution
          ? "border-emerald-500/30 bg-emerald-500/5 dark:border-emerald-500/35 dark:bg-emerald-500/10"
          : "border-border bg-muted/40 dark:border-white/10 dark:bg-[#1A1A1A]"
      }`}
    >
      <div
        className={`rounded-[22px] border p-6 sm:p-7 ${
          isSolution
            ? "border-emerald-500/20 bg-background dark:border-emerald-500/25 dark:bg-[#111111]"
            : "border-border/60 bg-background dark:border-white/5 dark:bg-[#111111]"
        }`}
      >
        <h3
          className={`mb-5 text-[13px] font-medium uppercase tracking-widest ${
            isSolution
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground"
          }`}
        >
          {title}
        </h3>
        <ul className="space-y-3.5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  isSolution
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-hidden
              >
                {isSolution ? (
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                ) : (
                  <X className="h-3 w-3" strokeWidth={2.5} />
                )}
              </span>
              <span
                className={`text-[14px] leading-relaxed sm:text-[15px] ${
                  isSolution ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Framework: Problem → Solution comparison, right after hero proof. */
export function ProblemSolution() {
  const { mode } = useLandingMode();
  const c = byMode[mode];

  return (
    <section
      id="problem"
      className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      aria-label="Problem and solution"
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
              className="flex max-w-xl flex-col items-center gap-3"
            >
              <h2 className="font-serif text-[clamp(28px,4vw,40px)] italic leading-tight text-muted-foreground">
                {c.headline}
              </h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground/90">
                {c.agitation}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="grid gap-4 md:grid-cols-2"
          >
            <SideCard
              title={c.problemTitle}
              items={c.problem}
              tone="problem"
            />
            <SideCard
              title={c.solutionTitle}
              items={c.solution}
              tone="solution"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
