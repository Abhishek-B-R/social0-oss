import { Link2, PenLine, Send } from "lucide-react";
import { C, ISO, LOGO_PATHS } from "./hero-illustrations/iso-tokens";

const steps = [
  {
    icon: Link2,
    title: "Connect your accounts",
    desc: "Secure OAuth for every platform in seconds — tokens stay encrypted.",
    n: "01",
    visual: "connect" as const,
  },
  {
    icon: PenLine,
    title: "Write your post",
    desc: "One composer. Customize captions per platform when you need to.",
    n: "02",
    visual: "write" as const,
  },
  {
    icon: Send,
    title: "Publish or schedule",
    desc: "Go live everywhere at once, or pick the perfect time on the calendar.",
    n: "03",
    visual: "publish" as const,
  },
];

function StepIso({ kind }: { kind: "connect" | "write" | "publish" }) {
  if (kind === "connect") {
    return (
      <svg viewBox="0 0 120 70" className="h-14 w-24" aria-hidden>
        <circle cx="60" cy="35" r="8" fill={C.accent} />
        {(["x", "ig", "li", "yt"] as const).map((logo, i) => {
          const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
          const cx = 60 + Math.cos(a) * 32;
          const cy = 35 + Math.sin(a) * 22;
          return (
            <g key={logo}>
              <line
                x1="60"
                y1="35"
                x2={cx}
                y2={cy}
                stroke={C.accent}
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <circle
                cx={cx}
                cy={cy}
                r="8"
                fill={C.bg}
                stroke={C.stroke}
                strokeWidth="1"
              />
              <g transform={`translate(${cx - 5} ${cy - 5})`}>
                <svg width="10" height="10" viewBox="0 0 24 24">
                  <path d={LOGO_PATHS[logo]} fill={C.ink} />
                </svg>
              </g>
            </g>
          );
        })}
      </svg>
    );
  }
  if (kind === "write") {
    return (
      <svg viewBox="0 0 120 70" className="h-14 w-24" aria-hidden>
        <rect
          x="18"
          y="10"
          width="84"
          height="50"
          rx="6"
          fill={C.elevated}
          stroke={C.stroke}
        />
        <rect x="26" y="20" width="40" height="4" rx="1" fill={C.accent} />
        <rect x="26" y="30" width="68" height="3" rx="1" fill={C.strokeSoft} />
        <rect x="26" y="38" width="56" height="3" rx="1" fill={C.strokeSoft} />
        <rect
          x="26"
          y="48"
          width="28"
          height="8"
          rx="3"
          fill={C.accent}
          opacity="0.9"
        />
      </svg>
    );
  }
  // publish: calendar + send arrows to platforms
  return (
    <svg viewBox="0 0 120 70" className="h-14 w-24" aria-hidden>
      <rect
        width="40"
        height="32"
        rx="2"
        transform={ISO.top(18, 12)}
        fill={C.panel}
        stroke={C.stroke}
      />
      <rect
        width="8"
        height="8"
        rx="1"
        transform={ISO.top(28, 24)}
        fill={C.accent}
      />
      {(["x", "ig", "li"] as const).map((logo, i) => (
        <g key={logo}>
          <line
            x1="70"
            y1="30"
            x2={95}
            y2={16 + i * 18}
            stroke={C.accent}
            strokeWidth="1.5"
            markerEnd="url(#arrow)"
          />
          <circle
            cx={102}
            cy={16 + i * 18}
            r="7"
            fill={C.bg}
            stroke={C.accent}
          />
          <g transform={`translate(97 ${11 + i * 18})`}>
            <svg width="10" height="10" viewBox="0 0 24 24">
              <path d={LOGO_PATHS[logo]} fill={C.accent} />
            </svg>
          </g>
        </g>
      ))}
    </svg>
  );
}

export function HowItWorks() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-12 flex flex-col items-center gap-3 text-center">
          <div className="flex h-8 items-center gap-2 rounded-[11px] border border-emerald-500/50 bg-emerald-500/5 px-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-400/90">
            How it works
          </div>
          <h2 className="max-w-md font-serif text-[clamp(28px,4vw,40px)] italic leading-tight text-muted-foreground">
            Three steps. Then you’re posting.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.title}
              className="group relative overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-[#1A1A1A]"
            >
              <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-6 dark:border-white/5 dark:bg-[#111111] sm:p-7">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px] tracking-[0.2em] text-muted-foreground">
                    {step.n}
                  </span>
                  <div className="rounded-xl bg-[var(--iso-bg)] px-2 py-1.5">
                    <StepIso kind={step.visual} />
                  </div>
                </div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 transition-colors group-hover:border-emerald-500/40">
                  <step.icon
                    className="h-5 w-5 text-emerald-700 dark:text-emerald-400"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="mb-2 font-serif text-xl tracking-tight text-foreground">
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
