import { Code, Video, Megaphone } from "lucide-react";
import { C, ISO } from "./hero-illustrations/iso-tokens";

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
    return (
      <svg viewBox="0 0 120 80" className="h-16 w-24" aria-hidden>
        <rect
          width="50"
          height="36"
          rx="2"
          transform={ISO.top(35, 12)}
          fill={C.elevated}
          stroke={C.accent}
        />
        <rect
          width="50"
          height="10"
          transform={ISO.right(35 + 50 * 0.866, 12 + 50 * 0.5)}
          fill={C.accentDim}
          stroke={C.accent}
        />
      </svg>
    );
  }
  if (kind === "creator") {
    return (
      <svg viewBox="0 0 120 80" className="h-16 w-24" aria-hidden>
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M${55 + i * 6} ${22 + i * 12}
               L${75 + i * 6} ${34 + i * 12}
               L${55 + i * 6} ${46 + i * 12}
               L${35 + i * 6} ${34 + i * 12} Z`}
            fill={i === 2 ? C.accent : C.mid}
            stroke={i === 2 ? C.accentHot : C.stroke}
          />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 80" className="h-16 w-24" aria-hidden>
      <rect
        width="56"
        height="40"
        rx="2"
        transform={ISO.top(32, 14)}
        fill={C.panel}
        stroke={C.stroke}
      />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          width="8"
          height={10 + i * 4}
          rx="1"
          transform={ISO.top(42 + i * 12, 48 - i * 2)}
          fill={i === 2 ? C.accent : C.muted}
          stroke={C.strokeSoft}
        />
      ))}
    </svg>
  );
}

export function WhoIsItFor() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-[1180px]">
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
              <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-6 dark:border-white/5 dark:bg-[#111111] sm:p-8">
                <div className="mb-6 flex h-20 items-center justify-center rounded-2xl bg-[var(--iso-bg)]">
                  <PersonaIso kind={persona.visual} />
                </div>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
                  <persona.icon
                    className="h-5 w-5 text-emerald-700 dark:text-emerald-400"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="mb-3 font-serif text-2xl tracking-tight text-foreground">
                  {persona.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground">
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
