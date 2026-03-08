import {
  Zap,
  Target,
  CalendarDays,
  Lock,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Parallel publishing",
    tag: "Fast",
    desc: "All platforms receive your post simultaneously. If one fails, the others still go through — you'll see exactly which.",
  },
  {
    icon: Target,
    title: "Per-platform captions",
    tag: "Flexible",
    desc: "Write a base caption and override it per platform. Twitter needs a hook, LinkedIn likes context.",
  },
  {
    icon: CalendarDays,
    title: "Smart scheduling",
    tag: "Organised",
    desc: "Pick a date and time. View everything in a calendar. Reschedule with a drag.",
  },
  {
    icon: Lock,
    title: "Encrypted token storage",
    tag: "Secure",
    desc: "OAuth tokens encrypted with AES-256-GCM. Your credentials never leave the server.",
  },
  {
    icon: MessageSquareText,
    title: "Threads & carousels",
    tag: "Rich content",
    desc: "Multi-part threads for Twitter and Bluesky. Image carousels for Instagram and LinkedIn.",
  },
  {
    icon: RefreshCw,
    title: "Auto-plug & repost",
    tag: "Growth",
    desc: "Automatically repost your evergreen content. Add a plug to popular posts when they hit a threshold.",
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
          <h2 className="max-w-md font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-foreground">
            Built for people who
            <br />
            actually post.
          </h2>
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
