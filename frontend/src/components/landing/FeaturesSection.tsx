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

function LogoNode({
  cx,
  cy,
  logo,
  r = 9,
}: {
  cx: number;
  cy: number;
  logo: keyof typeof LOGO_PATHS;
  r?: number;
}) {
  const s = Math.round(r * 1.2);
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={C.bg}
        stroke={C.accent}
        strokeWidth="1.5"
      />
      <g transform={`translate(${cx - s / 2} ${cy - s / 2})`}>
        <svg width={s} height={s} viewBox="0 0 24 24">
          <path d={LOGO_PATHS[logo]} fill={C.accent} />
        </svg>
      </g>
    </g>
  );
}

function IsoConnectVisual() {
  const logos = [
    "x",
    "ig",
    "li",
    "yt",
    "tt",
    "fb",
    "threads",
    "bluesky",
    "pin",
  ] as const;
  return (
    <svg
      viewBox="0 0 260 240"
      className="mx-auto h-[210px] w-full max-w-[300px]"
      aria-hidden
    >
      <path
        transform={ISO.top(50, 35)}
        fill={C.elevated}
        stroke={C.ink}
        strokeDasharray="5 5"
        d="M0 0h130 v130 H0z"
      />
      <ellipse
        cx="130"
        cy="100"
        rx="14"
        ry="8"
        fill={C.accent}
        opacity="0.9"
      />
      {logos.map((logo, i) => {
        const angle = (i / logos.length) * Math.PI * 2 - Math.PI / 2;
        const cx = 130 + Math.cos(angle) * 78;
        const cy = 100 + Math.sin(angle) * 52;
        return (
          <g key={logo}>
            <line
              x1="130"
              y1="100"
              x2={cx}
              y2={cy}
              stroke={C.accent}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.5"
            />
            <LogoNode cx={cx} cy={cy} logo={logo} r={10} />
          </g>
        );
      })}
    </svg>
  );
}

function IsoScheduleVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] space-y-2 px-4 py-2">
      {[
        { label: "Draft queue", active: false },
        { label: "2 posts running", active: true },
        { label: "Scheduled · Fri 9am", active: false },
      ].map((row) => (
        <div
          key={row.label}
          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-[12px] ${
            row.active
              ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          <span className="font-medium">{row.label}</span>
          {row.active ? (
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
  const logos = ["x", "li", "ig", "yt"] as const;
  return (
    <svg
      viewBox="0 0 200 120"
      className="mx-auto h-[110px] w-full max-w-[240px]"
      aria-hidden
    >
      {logos.map((logo, i) => {
        const r = Math.floor(i / 2);
        const c = i % 2;
        return (
          <g key={logo}>
            <path
              transform={ISO.top(50 + c * 55, 18 + r * 42)}
              fill={i === 1 ? C.accent : C.mid}
              stroke={i === 1 ? C.accentHot : C.stroke}
              d="M0 0h40 v40 H0z"
            />
            <g transform={`translate(${62 + c * 48} ${36 + r * 38})`}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path
                  d={LOGO_PATHS[logo]}
                  fill={i === 1 ? C.inkInverse : C.ink}
                />
              </svg>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function IsoGrowthVisual() {
  return (
    <svg
      viewBox="0 0 220 200"
      className="mx-auto h-[180px] w-full max-w-[260px]"
      aria-hidden
    >
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
      <path
        d="M50 150 L90 120 L120 100 L160 55"
        fill="none"
        stroke={C.accent}
        strokeWidth="2"
      />
      <circle cx="160" cy="55" r="7" fill={C.bg} stroke={C.accentHot} strokeWidth="2" />
      <path
        d="M148 70 h24 M160 58 v24"
        stroke={C.accent}
        strokeWidth="1.5"
        opacity="0.5"
      />
      <text
        x="168"
        y="48"
        fill={C.accentHot}
        fontSize="10"
        fontFamily="system-ui"
        fontWeight="600"
      >
        plug
      </text>
    </svg>
  );
}

function IsoCalendarVisual() {
  return (
    <svg viewBox="0 0 160 110" className="mx-auto h-[90px] w-full" aria-hidden>
      <rect
        width="100"
        height="72"
        rx="4"
        transform={ISO.top(40, 8)}
        fill={C.panel}
        stroke={C.stroke}
      />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect
            key={`${r}-${c}`}
            width="14"
            height="10"
            rx="1"
            transform={ISO.top(52 + c * 18, 24 + r * 14)}
            fill={
              (r === 1 && c === 2) || (r === 2 && c === 0)
                ? C.accent
                : C.muted
            }
            stroke={C.strokeSoft}
          />
        )),
      )}
    </svg>
  );
}

function IsoParallelVisual() {
  return (
    <svg viewBox="0 0 160 100" className="mx-auto h-[90px] w-full" aria-hidden>
      <circle cx="30" cy="50" r="10" fill={C.elevated} stroke={C.accent} />
      {["x", "ig", "li", "yt"].map((logo, i) => {
        const y = 18 + i * 20;
        return (
          <g key={logo}>
            <line
              x1="40"
              y1="50"
              x2="90"
              y2={y}
              stroke={C.accent}
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <LogoNode
              cx={105}
              cy={y}
              logo={logo as keyof typeof LOGO_PATHS}
              r={8}
            />
            <circle
              cx={130}
              cy={y}
              r="4"
              fill={i === 2 ? "#f59e0b" : C.accent}
            />
          </g>
        );
      })}
    </svg>
  );
}

function IsoSecureVisual() {
  return (
    <svg viewBox="0 0 140 100" className="mx-auto h-[90px] w-full" aria-hidden>
      <rect
        width="48"
        height="48"
        rx="4"
        transform={ISO.top(46, 18)}
        fill={C.elevated}
        stroke={C.accent}
        strokeWidth="1.5"
      />
      <path
        d="M70 40 v-10 a12 8 0 0 1 24 0 v10"
        fill="none"
        stroke={C.accentHot}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="82" cy="55" r="5" fill={C.accent} />
    </svg>
  );
}

function IsoThreadVisual() {
  return (
    <svg viewBox="0 0 160 100" className="mx-auto h-[90px] w-full" aria-hidden>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x={28 + i * 8}
            y={18 + i * 22}
            width="90"
            height="18"
            rx="4"
            fill={C.panel}
            stroke={i === 0 ? C.accent : C.stroke}
          />
          <rect
            x={36 + i * 8}
            y={24 + i * 22}
            width={50 - i * 8}
            height="4"
            rx="1"
            fill={C.strokeSoft}
          />
        </g>
      ))}
      <line
        x1="36"
        y1="36"
        x2="44"
        y2="40"
        stroke={C.accent}
        strokeWidth="1.5"
      />
      <line
        x1="44"
        y1="58"
        x2="52"
        y2="62"
        stroke={C.accent}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function IsoBulkVisual() {
  return (
    <svg viewBox="0 0 160 100" className="mx-auto h-[90px] w-full" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          width="22"
          height="28"
          rx="2"
          transform={ISO.top(30 + i * 22, 35 - (i % 2) * 8)}
          fill={i % 2 === 0 ? C.accent : C.mid}
          stroke={C.stroke}
          opacity={0.9}
        />
      ))}
      <path
        d="M40 80 H130"
        stroke={C.strokeSoft}
        strokeWidth="1"
        strokeDasharray="4 3"
      />
    </svg>
  );
}

function IsoApiVisual() {
  return (
    <svg viewBox="0 0 160 100" className="mx-auto h-[90px] w-full" aria-hidden>
      <rect
        x="20"
        y="22"
        width="120"
        height="56"
        rx="8"
        fill={C.elevated}
        stroke={C.stroke}
      />
      <text
        x="32"
        y="48"
        fill={C.accentHot}
        fontSize="11"
        fontFamily="ui-monospace, monospace"
      >
        $ social0 post
      </text>
      <text
        x="32"
        y="64"
        fill={C.strokeBright}
        fontSize="10"
        fontFamily="ui-monospace, monospace"
      >
        → mcp · api · cli
      </text>
    </svg>
  );
}

const moreFeatures = [
  {
    title: "Content calendar",
    desc: "Month and week views of drafts, scheduled, and published posts across every account.",
    visual: <IsoCalendarVisual />,
  },
  {
    title: "Parallel publishing",
    desc: "All platforms fire at once. One failure never blocks the rest — you’ll see exactly which.",
    visual: <IsoParallelVisual />,
  },
  {
    title: "Encrypted tokens",
    desc: "Official OAuth for every network. Tokens encrypted at rest — we never store passwords.",
    visual: <IsoSecureVisual />,
  },
  {
    title: "Threads & carousels",
    desc: "Multi-part threads for X, Threads, and Bluesky. Image carousels for Instagram and more.",
    visual: <IsoThreadVisual />,
  },
  {
    title: "Bulk scheduling",
    desc: "Drop in a folder of images or videos and schedule them across days in one pass.",
    visual: <IsoBulkVisual />,
  },
  {
    title: "API, MCP & CLI",
    desc: "Same publish pipeline from your stack — REST, remote MCP, or npm install -g social0.",
    visual: <IsoApiVisual />,
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
    >
      <div className="mx-auto mb-10 flex w-full max-w-[1080px] flex-col items-center gap-4 sm:mb-12">
        <div className="flex h-8 items-center gap-2 rounded-[11px] border border-emerald-500/60 bg-emerald-500/5 px-2.5 text-xs font-medium text-emerald-800 shadow-sm dark:border-emerald-500 dark:text-white/75">
          <span aria-hidden>✦</span>
          <span>Features</span>
        </div>
        <h2 className="max-w-xl text-center font-serif text-[clamp(22px,3.5vw,32px)] italic leading-tight text-muted-foreground">
          Everything you need to post everywhere, smarter
        </h2>
      </div>

      {/* Primary bento */}
      <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 items-start gap-4 lg:grid-cols-[1.12fr_1fr_1.12fr] lg:gap-3 xl:gap-4">
        <BentoShell>
          <div className="flex min-h-[400px] flex-col lg:min-h-[520px]">
            <div className="flex flex-1 items-center justify-center px-4 pt-8">
              <IsoConnectVisual />
            </div>
            <div className="space-y-2 px-6 pb-8 pt-4 text-center sm:px-8 sm:text-left">
              <h3 className="text-[18px] font-semibold tracking-tight text-foreground sm:text-[20px]">
                Connect all 9 platforms
              </h3>
              <p className="text-[14px] leading-relaxed text-muted-foreground">
                X, Instagram, LinkedIn, YouTube, TikTok, Facebook, Threads,
                Bluesky, and Pinterest — one encrypted publish pipeline.
              </p>
            </div>
          </div>
        </BentoShell>

        <div className="flex flex-col gap-4 lg:gap-3 xl:gap-4">
          <BentoShell>
            <div className="flex min-h-[230px] flex-col">
              <div className="flex flex-1 items-center px-2 pt-6">
                <IsoScheduleVisual />
              </div>
              <div className="space-y-2 px-6 pb-6 pt-3 text-center sm:px-7 sm:text-left">
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
            <div className="flex min-h-[250px] flex-col">
              <div className="flex flex-1 items-center justify-center px-4 pt-6">
                <IsoCaptionVisual />
              </div>
              <div className="space-y-2 px-6 pb-6 pt-3 text-center sm:px-7 sm:text-left">
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

        <BentoShell>
          <div className="flex min-h-[400px] flex-col lg:min-h-[520px]">
            <div className="flex flex-1 items-center justify-center px-4 pt-8">
              <IsoGrowthVisual />
            </div>
            <div className="space-y-2 px-6 pb-8 pt-4 text-center sm:px-8 sm:text-left">
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

      {/* Expanded feature grid */}
      <div className="mx-auto mt-4 grid w-full max-w-[1080px] gap-4 sm:grid-cols-2 lg:mt-5 lg:grid-cols-3 lg:gap-3 xl:gap-4">
        {moreFeatures.map((f) => (
          <BentoShell key={f.title}>
            <div className="flex min-h-[220px] flex-col p-5 sm:p-6">
              <div className="mb-4 flex h-[100px] items-center justify-center rounded-2xl bg-[var(--iso-bg)]">
                {f.visual}
              </div>
              <h3 className="mb-1.5 text-center text-[16px] font-semibold tracking-tight text-foreground sm:text-left">
                {f.title}
              </h3>
              <p className="text-center text-[13px] leading-relaxed text-muted-foreground sm:text-left">
                {f.desc}
              </p>
            </div>
          </BentoShell>
        ))}
      </div>
    </section>
  );
}
