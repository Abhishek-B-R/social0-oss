import type React from "react";
import {
  GitBranch,
  PenLine,
  CalendarDays,
  ShieldCheck,
  Layers,
  RefreshCw,
} from "lucide-react";
import { C, ISO } from "./hero-illustrations/iso-tokens";

type Feature = {
  icon: typeof GitBranch;
  title: string;
  tag: string;
  desc: React.ReactNode;
  visual: "publish" | "caption" | "schedule" | "secure" | "rich" | "growth";
};

const features: Feature[] = [
  {
    icon: GitBranch,
    title: "Parallel publishing",
    tag: "Fast",
    visual: "publish",
    desc: "All platforms receive your post at the same time. If one fails, the others still go through — and you'll see exactly which.",
  },
  {
    icon: PenLine,
    title: "Per-platform captions",
    tag: "Flexible",
    visual: "caption",
    desc: (
      <>
        Write one base caption and customize it per platform.
        <br />
        Twitter needs a hook. LinkedIn likes context.
      </>
    ),
  },
  {
    icon: CalendarDays,
    title: "Smart scheduling",
    tag: "Organised",
    visual: "schedule",
    desc: "Pick a date and time. View everything in a calendar. Reschedule if needed.",
  },
  {
    icon: ShieldCheck,
    title: "Encrypted token storage",
    tag: "Secure",
    visual: "secure",
    desc: "Your accounts stay secure. OAuth tokens are encrypted and we never store passwords.",
  },
  {
    icon: Layers,
    title: "Threads & carousels",
    tag: "Rich content",
    visual: "rich",
    desc: (
      <>
        Create multi-part threads for Twitter and Bluesky.
        <br />
        Post image carousels to Instagram and TikTok.
      </>
    ),
  },
  {
    icon: RefreshCw,
    title: "Auto-plug & repost",
    tag: "Growth",
    desc: (
      <>
        Automatically repost evergreen content to extend its reach.
        <br />
        Add a call-to-action to top-performing posts to capture leads.
      </>
    ),
    visual: "growth",
  },
];

function FeatureIsoVisual({ kind }: { kind: Feature["visual"] }) {
  if (kind === "publish") {
    return (
      <svg viewBox="0 0 160 100" className="h-full w-full" aria-hidden>
        <rect
          width="70"
          height="50"
          rx="3"
          transform={ISO.top(50, 10)}
          fill={C.elevated}
          stroke={C.accent}
        />
        <rect
          width="70"
          height="14"
          rx="1"
          transform={ISO.right(50 + 70 * 0.866, 10 + 70 * 0.5)}
          fill={C.accentDim}
          stroke={C.accent}
        />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            width="22"
            height="16"
            rx="2"
            transform={ISO.top(20 + i * 42, 58)}
            fill={C.panel}
            stroke={i === 1 ? C.accentHot : C.strokeSoft}
          />
        ))}
      </svg>
    );
  }
  if (kind === "schedule") {
    return (
      <svg viewBox="0 0 160 100" className="h-full w-full" aria-hidden>
        <rect
          width="90"
          height="70"
          rx="3"
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
              transform={ISO.top(52 + c * 18, 22 + r * 14)}
              fill={r === 1 && c === 2 ? C.accent : C.muted}
              stroke={C.strokeSoft}
            />
          )),
        )}
      </svg>
    );
  }
  if (kind === "secure") {
    return (
      <svg viewBox="0 0 160 100" className="h-full w-full" aria-hidden>
        <rect
          width="50"
          height="50"
          rx="4"
          transform={ISO.top(55, 15)}
          fill={C.elevated}
          stroke={C.accent}
          strokeWidth="1.5"
        />
        <path
          d="M78 42 v-8 a10 6 0 0 1 20 0 v8"
          fill="none"
          stroke={C.accentHot}
          strokeWidth="2"
          transform="translate(-8 0)"
        />
        <circle cx="80" cy="52" r="5" fill={C.accent} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 100" className="h-full w-full" aria-hidden>
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${80 + i * 8} ${28 + i * 14}
             L${110 + i * 8} ${46 + i * 14}
             L${80 + i * 8} ${64 + i * 14}
             L${50 + i * 8} ${46 + i * 14} Z`}
          fill={i === 2 ? C.accent : C.mid}
          stroke={i === 2 ? C.accentHot : C.strokeBright}
          strokeDasharray={i < 2 ? "2 2" : undefined}
          opacity={0.9 - i * 0.05}
        />
      ))}
    </svg>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="px-6 py-20 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-14">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
            Features
          </div>
          <h2 className="max-w-[520px] font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-foreground">
            Built for people who{" "}
            <em className="italic text-muted-foreground">actually post.</em>
          </h2>
          <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
            Tools that save time, reduce tab switching, and help your content
            reach more people.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-[22px] border border-border bg-muted/40 p-1.5 transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] hover:-translate-y-1.5 dark:border-white/10 dark:bg-[#1A1A1A]"
            >
              <div className="flex h-full flex-col rounded-[18px] border border-border/60 bg-background p-5 dark:border-white/5 dark:bg-[#111111] md:p-6">
                <div className="mb-5 h-24 w-full overflow-hidden rounded-xl bg-[#151515] opacity-90 transition-opacity group-hover:opacity-100">
                  <FeatureIsoVisual kind={f.visual} />
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
                    <f.icon
                      className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                      strokeWidth={1.5}
                    />
                  </div>
                  <span className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400/90">
                    {f.tag}
                  </span>
                </div>
                <h3 className="mb-2 text-[17px] font-semibold tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
