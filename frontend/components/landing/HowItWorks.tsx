import { Link2, PenLine, Send } from "lucide-react";

const steps = [
  {
    icon: Link2,
    title: "Connect your accounts",
    desc: "OAuth for every platform. Tokens encrypted at rest. We never store passwords.",
  },
  {
    icon: PenLine,
    title: "Write your post",
    desc: "One composer. Per-platform captions if you need them. Character limits shown live.",
  },
  {
    icon: Send,
    title: "Publish or schedule",
    desc: "Hit publish now, or pick a time. All platforms receive the post in parallel.",
  },
];

export function HowItWorks() {
  return (
    <section className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        {/* Section header */}
        <div className="mb-14">
          <div className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            How it works
          </div>
          <h2 className="max-w-md font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-foreground">
            How it works
          </h2>
        </div>

        {/* 3-column bordered grid */}
        <div className="grid gap-px overflow-hidden rounded-2xl bg-border md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="bg-background p-8 transition-colors hover:bg-muted/40 dark:hover:bg-muted/20 md:p-10"
            >
              <div className="mb-6 flex items-center gap-3 font-mono text-[11px] tracking-widest text-muted-foreground">
                0{i + 1}
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/50 dark:bg-muted/30">
                <step.icon
                  className="h-5 w-5 text-foreground"
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
          ))}
        </div>
      </div>
    </section>
  );
}
