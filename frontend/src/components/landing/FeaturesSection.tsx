import type { ReactNode } from "react";
import {
  WfConnections,
  WfScheduleCreate,
  WfCaptions,
  WfAutopilot,
  WfCalendar,
  WfPublishStatus,
  WfSecure,
  WfThreads,
  WfBulk,
  WfApiCli,
} from "./wireframes/ProductWireframes";
import { WireframeStage } from "./wireframes/WireframeStage";

function BentoShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group rounded-[28px] bg-muted/60 p-[5px] dark:bg-[#1A1A1A] sm:rounded-[32px] lg:rounded-[42px] ${className}`}
    >
      <div className="rounded-[24px] border border-border p-[2px] dark:border-white/10 sm:rounded-[28px] lg:rounded-[38px]">
        <div className="overflow-hidden rounded-[20px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111] sm:rounded-[24px] lg:rounded-[34px]">
          {children}
        </div>
      </div>
    </div>
  );
}

const moreFeatures = [
  {
    title: "Content calendar",
    desc: "Month and week views of drafts, scheduled, and published posts across every account.",
    visual: <WfCalendar className="h-[130px] w-full" />,
    tint: "from-emerald-500/10 to-transparent",
  },
  {
    title: "Parallel publishing",
    desc: "All platforms fire at once. One failure never blocks the rest — you’ll see exactly which.",
    visual: <WfPublishStatus className="h-[130px] w-full" />,
    tint: "from-sky-500/10 to-transparent",
  },
  {
    title: "Encrypted tokens",
    desc: "Official OAuth for every network. Tokens encrypted at rest — we never store passwords.",
    visual: <WfSecure className="h-[130px] w-full" />,
    tint: "from-amber-500/10 to-transparent",
  },
  {
    title: "Threads & carousels",
    desc: "Multi-part threads for X, Threads, and Bluesky. Image carousels for Instagram and more.",
    visual: <WfThreads className="h-[130px] w-full" />,
    tint: "from-violet-500/10 to-transparent",
  },
  {
    title: "Bulk scheduling",
    desc: "Drop in a folder of images or videos and schedule them across days in one pass.",
    visual: <WfBulk className="h-[130px] w-full" />,
    tint: "from-emerald-500/10 to-transparent",
  },
  {
    title: "API, MCP & CLI",
    desc: "Same publish pipeline from your stack — REST, remote MCP, or npm install -g social0.",
    visual: <WfApiCli className="h-[130px] w-full" />,
    tint: "from-teal-500/10 to-transparent",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <div className="mx-auto mb-10 flex w-full max-w-[1120px] flex-col items-center gap-4">
        <h2 className="max-w-xl text-center font-serif text-[clamp(22px,3.5vw,34px)] italic leading-tight text-muted-foreground">
          Everything you need to post everywhere, smarter
        </h2>
      </div>

      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 items-start gap-4 lg:grid-cols-[1.12fr_1fr_1.12fr] lg:gap-3 xl:gap-4">
        <BentoShell>
          <div className="flex min-h-[400px] flex-col lg:min-h-[500px]">
            <WireframeStage className="m-3 mb-0 flex-1 rounded-[18px] border-0 sm:m-4" tall>
              <WfConnections className="h-[260px] w-full" />
            </WireframeStage>
            <div className="space-y-2 px-6 pb-7 pt-4 text-center sm:px-8 sm:text-left">
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
              <WireframeStage className="m-3 mb-0 rounded-[16px] border-0 sm:m-3.5">
                <WfScheduleCreate className="h-[150px] w-full" />
              </WireframeStage>
              <div className="space-y-2 px-6 pb-5 pt-3 text-center sm:px-7 sm:text-left">
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground">
                  Scheduling & workflows
                </h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Schedule posts, queue slots, drafts — reschedule when plans
                  change.
                </p>
              </div>
            </div>
          </BentoShell>

          <BentoShell>
            <div className="flex min-h-[250px] flex-col">
              <WireframeStage className="m-3 mb-0 rounded-[16px] border-0 sm:m-3.5">
                <WfCaptions className="h-[160px] w-full" />
              </WireframeStage>
              <div className="space-y-2 px-6 pb-5 pt-3 text-center sm:px-7 sm:text-left">
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
          <div className="flex min-h-[400px] flex-col lg:min-h-[500px]">
            <WireframeStage className="m-3 mb-0 flex-1 rounded-[18px] border-0 sm:m-4" tall>
              <WfAutopilot className="h-[240px] w-full" />
            </WireframeStage>
            <div className="space-y-2 px-6 pb-7 pt-4 text-center sm:px-8 sm:text-left">
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

      <div className="mx-auto mt-4 grid w-full max-w-[1120px] gap-4 sm:grid-cols-2 lg:mt-5 lg:grid-cols-3 lg:gap-3 xl:gap-4">
        {moreFeatures.map((f) => (
          <BentoShell key={f.title}>
            <div className="flex min-h-[220px] flex-col p-4 sm:p-5">
              <WireframeStage
                className={`mb-4 rounded-[16px] border-0 bg-gradient-to-b ${f.tint}`}
              >
                {f.visual}
              </WireframeStage>
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
