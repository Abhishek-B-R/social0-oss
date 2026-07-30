import { Link2, PenLine, Send } from "lucide-react";
import { C, ISO } from "./hero-illustrations/iso-tokens";

const steps = [
  {
    icon: Link2,
    title: "Connect your accounts",
    desc: "Secure OAuth for every platform in seconds — tokens stay encrypted.",
    n: "01",
  },
  {
    icon: PenLine,
    title: "Write your post",
    desc: "One composer. Customize captions per platform when you need to.",
    n: "02",
  },
  {
    icon: Send,
    title: "Publish or schedule",
    desc: "Go live everywhere at once, or pick the perfect time on the calendar.",
    n: "03",
  },
];

function StepIso({ index }: { index: number }) {
  return (
    <svg viewBox="0 0 100 70" className="h-14 w-20" aria-hidden>
      <rect
        width="44"
        height="32"
        rx="2"
        transform={ISO.top(28, 10)}
        fill={index === 1 ? C.accent : C.elevated}
        stroke={index === 1 ? C.accentHot : C.stroke}
      />
      <rect
        width="44"
        height="10"
        transform={ISO.right(28 + 44 * 0.866, 10 + 44 * 0.5)}
        fill={index === 1 ? C.accentDim : C.muted}
        stroke={index === 1 ? C.accent : C.strokeSoft}
      />
    </svg>
  );
}

export function HowItWorks() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-12 flex flex-col items-center gap-3 text-center">
          <div className="flex h-8 items-center gap-2 rounded-[11px] border border-emerald-500/50 bg-emerald-500/5 px-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-400/90">
            How it works
          </div>
          <h2 className="max-w-md font-serif text-[clamp(28px,4vw,40px)] italic leading-tight text-muted-foreground">
            Three steps. Then you’re posting.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="group relative overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-[#1A1A1A]"
            >
              <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-6 dark:border-white/5 dark:bg-[#111111] sm:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-mono text-[12px] tracking-[0.2em] text-muted-foreground">
                    {step.n}
                  </span>
                  <div className="rounded-xl bg-[var(--iso-bg)] px-2 py-1">
                    <StepIso index={i} />
                  </div>
                </div>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 transition-colors group-hover:border-emerald-500/40">
                  <step.icon
                    className="h-5 w-5 text-emerald-700 dark:text-emerald-400"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="mb-3 font-serif text-xl tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
