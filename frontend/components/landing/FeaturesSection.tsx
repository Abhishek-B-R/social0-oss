import type React from "react";
import {
  Zap,
  Target,
  CalendarDays,
  Lock,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";

type Feature = {
  icon: typeof Zap;
  title: string;
  tag: string;
  desc: React.ReactNode;
};

const features: Feature[] = [
  {
    icon: Zap,
    title: "Parallel publishing",
    tag: "Fast",
    desc: "All platforms receive your post at the same time. If one fails, the others still go through — and you'll see exactly which.",
  },
  {
    icon: Target,
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
    icon: Lock,
    title: "Encrypted token storage",
    tag: "Secure",
    desc: "Your accounts stay secure. OAuth tokens are encrypted and we never store passwords.",
  },
  {
    icon: MessageSquareText,
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
        Add a plug to your best-performing posts to capture leads and
        opportunities.
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
            <div
              key={f.title}
              className="group bg-background p-8 transition-colors hover:bg-muted/40 dark:hover:bg-muted/20 md:p-10"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/50 dark:bg-muted/30">
                <f.icon className="h-5 w-5 text-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="mb-2 text-[17px] font-semibold tracking-tight text-foreground">
                {f.title}
              </h3>
              <p className="text-[14px] leading-relaxed text-muted-foreground">
                {f.desc}
              </p>
              {f.tag && (
                <span className="mt-4 inline-block rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium uppercase tracking-widest text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  {f.tag}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
