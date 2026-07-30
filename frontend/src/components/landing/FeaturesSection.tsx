import type { ReactNode } from "react";
import { C, ISO, LOGO_PATHS } from "./hero-illustrations/iso-tokens";

function BentoShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] bg-muted/60 p-[5px] dark:bg-[#1A1A1A] sm:rounded-[32px] lg:rounded-[42px] ${className}`}
    >
      <div className="rounded-[24px] border border-border p-[2px] dark:border-white/10 sm:rounded-[28px] lg:rounded-[38px]">
        <div className="overflow-hidden rounded-[20px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111] sm:rounded-[24px] lg:rounded-[34px]">
          {children}
        </div>
      </div>
    </div>
  );
}

function IsoConnectVisual() {
  return (
    <svg viewBox="0 0 240 220" className="mx-auto h-[200px] w-full max-w-[280px]" aria-hidden>
      <path
        transform={ISO.top(40, 40)}
        fill={C.elevated}
        stroke={C.ink}
        strokeDasharray="5 5"
        d="M0 0h120 v120 H0z"
      />
      {[
        [90, 70],
        [130, 90],
        [90, 110],
        [50, 90],
      ].map(([x, y], i) => (
        <g key={i}>
          <path
            transform={ISO.top(x, y)}
            fill={C.mid}
            stroke={C.stroke}
            strokeDasharray="4 4"
            d="M0 0h28 v28 H0z"
          />
        </g>
      ))}
      {[
        { cx: 155, cy: 175, logo: "x" as const },
        { cx: 175, cy: 165, logo: "ig" as const },
        { cx: 195, cy: 175, logo: "li" as const },
        { cx: 175, cy: 185, logo: "yt" as const },
      ].map((n) => (
        <g key={n.logo}>
          <circle
            cx={n.cx}
            cy={n.cy}
            r="10"
            fill={C.bg}
            stroke={C.accent}
            strokeWidth="1.5"
          />
          <g transform={`translate(${n.cx - 5} ${n.cy - 5})`}>
            <svg width="10" height="10" viewBox="0 0 24 24">
              <path d={LOGO_PATHS[n.logo]} fill={C.accent} />
            </svg>
          </g>
        </g>
      ))}
      <path
        d="M140 150 L155 170"
        stroke={C.accent}
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function IsoScheduleVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] space-y-2 px-4 py-2">
      {["Draft queue", "2 posts running", "Scheduled · Fri 9am"].map((label, i) => (
        <div
          key={label}
          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-[12px] ${
            i === 1
              ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          <span className="font-medium">{label}</span>
          {i === 1 ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          ) : (
            <span className="grid grid-cols-2 gap-0.5 opacity-40">
              {Array.from({ length: 6 }).map((_, d) => (
                <span key={d} className="h-1 w-1 rounded-full bg-foreground" />
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function IsoCaptionVisual() {
  return (
    <svg viewBox="0 0 200 120" className="mx-auto h-[110px] w-full max-w-[240px]" aria-hidden>
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <g key={`${r}-${c}`}>
            <path
              transform={ISO.top(50 + c * 55, 20 + r * 40)}
              fill={r === 0 && c === 1 ? C.accent : C.mid}
              stroke={r === 0 && c === 1 ? C.accentHot : C.stroke}
              d="M0 0h40 v40 H0z"
            />
            <g transform={`translate(${62 + c * 48} ${38 + r * 36})`}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path
                  d={
                    [LOGO_PATHS.x, LOGO_PATHS.li, LOGO_PATHS.ig, LOGO_PATHS.yt][
                      r * 2 + c
                    ]
                  }
                  fill={r === 0 && c === 1 ? C.inkInverse : C.ink}
                />
              </svg>
            </g>
          </g>
        )),
      )}
    </svg>
  );
}

function IsoGrowthVisual() {
  return (
    <svg viewBox="0 0 220 200" className="mx-auto h-[180px] w-full max-w-[260px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={`h${i}`}
          x1="30"
          y1={40 + i * 28}
          x2="190"
          y2={40 + i * 28}
          stroke={C.strokeSoft}
          strokeWidth="1"
        />
      ))}
      {[0, 1, 2].map((i) => (
        <line
          key={`v${i}`}
          x1={70 + i * 40}
          y1="30"
          x2={70 + i * 40}
          y2="170"
          stroke={C.accent}
          strokeWidth="1.5"
          opacity={0.7}
        />
      ))}
      <circle cx="110" cy="96" r="8" fill={C.bg} stroke={C.accent} strokeWidth="2" />
      <circle cx="150" cy="68" r="5" fill={C.accent} />
      <path
        d="M70 140 L110 96 L150 68"
        fill="none"
        stroke={C.accentHot}
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
    </svg>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="relative px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto mb-10 flex w-full max-w-[1200px] flex-col items-center gap-4 sm:mb-12">
        <div className="flex h-8 items-center gap-2 rounded-[11px] border border-emerald-500/60 bg-emerald-500/5 px-2.5 text-xs font-medium text-emerald-800 shadow-sm dark:border-emerald-500 dark:text-white/75">
          <span aria-hidden>✦</span>
          <span>Features</span>
        </div>
        <h2 className="max-w-xl text-center font-serif text-[clamp(22px,3.5vw,32px)] italic leading-tight text-muted-foreground">
          Everything you need to post everywhere, smarter
        </h2>
      </div>

      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-start gap-4 lg:grid-cols-[1.12fr_1fr_1.12fr] lg:gap-3 xl:gap-4">
        {/* Left tall */}
        <BentoShell>
          <div className="flex min-h-[420px] flex-col lg:min-h-[560px]">
            <div className="flex flex-1 items-center justify-center px-4 pt-8">
              <IsoConnectVisual />
            </div>
            <div className="space-y-2 px-6 pb-8 pt-4 sm:px-8">
              <h3 className="text-[18px] font-semibold tracking-tight text-foreground sm:text-[20px]">
                Connect everything you already use
              </h3>
              <p className="text-[14px] leading-relaxed text-muted-foreground">
                Bring X, Instagram, LinkedIn, YouTube, TikTok, and more into one
                publish pipeline — with encrypted tokens.
              </p>
            </div>
          </div>
        </BentoShell>

        {/* Middle stack */}
        <div className="flex flex-col gap-4 lg:gap-3 xl:gap-4">
          <BentoShell>
            <div className="flex min-h-[240px] flex-col lg:min-h-[260px]">
              <div className="flex flex-1 items-center px-2 pt-6">
                <IsoScheduleVisual />
              </div>
              <div className="space-y-2 px-6 pb-6 pt-3 sm:px-7">
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground">
                  Scheduling & workflows
                </h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Schedule posts, view them in a calendar, and reschedule when
                  plans change.
                </p>
              </div>
            </div>
          </BentoShell>

          <BentoShell>
            <div className="flex min-h-[260px] flex-col lg:min-h-[280px]">
              <div className="flex flex-1 items-center justify-center px-4 pt-6">
                <IsoCaptionVisual />
              </div>
              <div className="space-y-2 px-6 pb-6 pt-3 sm:px-7">
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground">
                  Per-platform captions
                </h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Write once, then tune the hook for X and the context for
                  LinkedIn — without leaving the composer.
                </p>
              </div>
            </div>
          </BentoShell>
        </div>

        {/* Right tall */}
        <BentoShell>
          <div className="flex min-h-[420px] flex-col lg:min-h-[560px]">
            <div className="flex flex-1 items-center justify-center px-4 pt-8">
              <IsoGrowthVisual />
            </div>
            <div className="space-y-2 px-6 pb-8 pt-4 sm:px-8">
              <h3 className="text-[18px] font-semibold tracking-tight text-foreground sm:text-[20px]">
                Grow on autopilot
              </h3>
              <p className="text-[14px] leading-relaxed text-muted-foreground">
                Auto-plug winning posts, repost evergreen content, and ship
                threads & carousels without the busywork.
              </p>
            </div>
          </div>
        </BentoShell>
      </div>
    </section>
  );
}
