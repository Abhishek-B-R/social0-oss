import { Link2, PenLine, Send } from "lucide-react";
import {
  WfConnections,
  WfComposer,
  WfScheduleCreate,
} from "./wireframes/ProductWireframes";
import { WireframeStage } from "./wireframes/WireframeStage";

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

function StepVisual({ kind }: { kind: "connect" | "write" | "publish" }) {
  if (kind === "connect")
    return <WfConnections className="h-[168px] w-full" />;
  if (kind === "write") return <WfComposer className="h-[168px] w-full" />;
  return <WfScheduleCreate className="h-[168px] w-full" />;
}

export function HowItWorks() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
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
              <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-5 dark:border-white/5 dark:bg-[#111111] sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px] tracking-[0.2em] text-muted-foreground">
                    {step.n}
                  </span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 transition-colors group-hover:border-emerald-500/40">
                    <step.icon
                      className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                      strokeWidth={1.5}
                    />
                  </div>
                </div>
                <WireframeStage className="mb-5" tall>
                  <StepVisual kind={step.visual} />
                </WireframeStage>
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
