import type React from "react";
import {
  GitBranch,
  PenLine,
  CalendarDays,
  ShieldCheck,
  Layers,
  RefreshCw,
} from "lucide-react";

type Feature = {
  icon: typeof GitBranch;
  title: string;
  tag: string;
  desc: React.ReactNode;
};

const features: Feature[] = [
  {
    icon: GitBranch,
    title: "Parallel publishing",
    tag: "Fast",
    desc: "All platforms receive your post at the same time. If one fails, the others still go through — and you'll see exactly which.",
  },
  {
    icon: PenLine,
    title: "Per-platform captions",
    tag: "Flexible",
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
    desc: "Pick a date and time. View everything in a calendar. Reschedule if needed.",
  },
  {
    icon: ShieldCheck,
    title: "Encrypted token storage",
    tag: "Secure",
    desc: "Your accounts stay secure. OAuth tokens are encrypted and we never store passwords.",
  },
  {
    icon: Layers,
    title: "Threads & carousels",
    tag: "Rich content",
    desc: (
      <>
        Create multi-part threads for Twitter and Bluesky.
        <br />
        Post image carousels to Instagram and Tiktok.
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
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        {/* Section header */}
        <div className="mb-14">
          <div className="mb-3 text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Features
          </div>
          <h2 className="max-w-[480px] font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-foreground">
            Built for people who actually post.
          </h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Tools that save time, reduce tab switching, and help your content
            reach more people.
          </p>
        </div>

        {/* 2-column bordered grid */}
        <div className="grid gap-px overflow-hidden rounded-2xl bg-border md:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="bg-background p-3 md:p-4">
              <div className="group flex h-full flex-col rounded-2xl p-5 transition-colors duration-300 ease-out hover:bg-[#EBE6DE] md:p-6 dark:hover:bg-white/6">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/50 transition-all duration-300 group-hover:border-emerald-500/35 group-hover:shadow-[0_0_14px_rgba(16,185,129,0.18)] dark:bg-muted/30 dark:group-hover:shadow-[0_0_14px_rgba(16,185,129,0.22)]">
                  <f.icon
                    className="h-5 w-5 text-foreground transition-colors duration-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="mb-2 text-[17px] font-semibold tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
                <span className="mt-4 w-fit self-start rounded px-2 py-1 text-[11px] font-medium uppercase tracking-widest text-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400">
                  {f.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
