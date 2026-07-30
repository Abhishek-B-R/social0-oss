import { Code, Video, Megaphone } from "lucide-react";
import { C, ISO, LOGO_PATHS } from "./hero-illustrations/iso-tokens";

const personas = [
  {
    title: "Indie Builders",
    description:
      "Building in public? Ship updates to X, Bluesky, and Threads without the tab dance.",
    icon: Code,
    visual: "builder" as const,
  },
  {
    title: "Content Creators",
    description:
      "One post, nine platforms. Share images and videos without copying between apps all day.",
    icon: Video,
    visual: "creator" as const,
  },
  {
    title: "Solo Marketers",
    description:
      "Run your company’s social media without hiring a team or an agency.",
    icon: Megaphone,
    visual: "marketer" as const,
  },
];

function PersonaIso({ kind }: { kind: "builder" | "creator" | "marketer" }) {
  if (kind === "builder") {
    // Terminal + posts flying to platforms
    return (
      <svg viewBox="0 0 160 90" className="h-[72px] w-[140px]" aria-hidden>
        <rect
          x="8"
          y="18"
          width="70"
          height="54"
          rx="6"
          fill={C.elevated}
          stroke={C.stroke}
        />
        <circle cx="18" cy="28" r="2.5" fill="#ff5f57" />
        <circle cx="28" cy="28" r="2.5" fill="#febc2e" />
        <circle cx="38" cy="28" r="2.5" fill="#28c840" />
        <rect x="16" y="38" width="40" height="4" rx="1" fill={C.accent} />
        <rect x="16" y="48" width="52" height="3" rx="1" fill={C.strokeSoft} />
        <rect x="16" y="56" width="36" height="3" rx="1" fill={C.strokeSoft} />
        {(["x", "bluesky", "threads"] as const).map((logo, i) => {
          const y = 28 + i * 18;
          return (
            <g key={logo}>
              <line
                x1="78"
                y1="45"
                x2="118"
                y2={y}
                stroke={C.accent}
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <circle
                cx="130"
                cy={y}
                r="9"
                fill={C.bg}
                stroke={C.accent}
                strokeWidth="1.5"
              />
              <g transform={`translate(124 ${y - 6})`}>
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d={LOGO_PATHS[logo]} fill={C.accent} />
                </svg>
              </g>
            </g>
          );
        })}
      </svg>
    );
  }
  if (kind === "creator") {
    // Media frame + platform fan-out
    return (
      <svg viewBox="0 0 160 90" className="h-[72px] w-[140px]" aria-hidden>
        <rect
          width="56"
          height="40"
          rx="3"
          transform={ISO.top(40, 18)}
          fill={C.panel}
          stroke={C.stroke}
        />
        <path
          d="M55 38 l12 8 l12 -16"
          fill="none"
          stroke={C.accent}
          strokeWidth="2"
          transform={ISO.top(0, 0)}
        />
        <circle cx="58" cy="32" r="4" fill={C.accent} opacity="0.7" />
        {(["ig", "yt", "tt"] as const).map((logo, i) => (
          <g key={logo} transform={`translate(${100 + i * 2} ${22 + i * 20})`}>
            <circle
              cx="12"
              cy="8"
              r="9"
              fill={C.bg}
              stroke={C.accent}
              strokeWidth="1.5"
            />
            <svg x="6" y="2" width="12" height="12" viewBox="0 0 24 24">
              <path d={LOGO_PATHS[logo]} fill={C.accent} />
            </svg>
          </g>
        ))}
      </svg>
    );
  }
  // Marketer: megaphone + growth bars
  return (
    <svg viewBox="0 0 160 90" className="h-[72px] w-[140px]" aria-hidden>
      <path
        d="M30 35 L55 28 L55 62 L30 55 Z"
        fill={C.elevated}
        stroke={C.accent}
        strokeWidth="1.5"
      />
      <path
        d="M55 32 L85 22 L85 68 L55 58 Z"
        fill={C.accent}
        opacity="0.85"
      />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={100 + i * 12}
          y={60 - (i + 1) * 10}
          width="8"
          height={(i + 1) * 10}
          rx="1"
          fill={i === 3 ? C.accentHot : C.muted}
          stroke={C.strokeSoft}
        />
      ))}
    </svg>
  );
}

export function WhoIsItFor() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-12 flex flex-col items-center gap-3 text-center">
          <div className="flex h-8 items-center gap-2 rounded-[11px] border border-emerald-500/50 bg-emerald-500/5 px-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-400/90">
            Who it’s for
          </div>
          <h2 className="max-w-md font-serif text-[clamp(28px,4vw,40px)] italic leading-tight text-muted-foreground">
            Built for people who actually post
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {personas.map((persona) => (
            <div
              key={persona.title}
              className="group relative overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-[#1A1A1A]"
            >
              <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-6 dark:border-white/5 dark:bg-[#111111] sm:p-7">
                <div className="mb-5 flex h-[88px] items-center justify-center rounded-2xl bg-[var(--iso-bg)]">
                  <PersonaIso kind={persona.visual} />
                </div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
                  <persona.icon
                    className="h-5 w-5 text-emerald-700 dark:text-emerald-400"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="mb-2 font-serif text-xl tracking-tight text-foreground sm:text-2xl">
                  {persona.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
                  {persona.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
