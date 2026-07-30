import { Code, Video, Megaphone } from "lucide-react";
import {
  WfBuilder,
  WfCreator,
  WfMarketer,
} from "./wireframes/ProductWireframes";

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

function PersonaVisual({ kind }: { kind: "builder" | "creator" | "marketer" }) {
  if (kind === "builder") return <WfBuilder className="h-[120px] w-full" />;
  if (kind === "creator") return <WfCreator className="h-[120px] w-full" />;
  return <WfMarketer className="h-[120px] w-full" />;
}

export function WhoIsItFor() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
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
              <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-5 dark:border-white/5 dark:bg-[#111111] sm:p-6">
                <div className="mb-5 overflow-hidden rounded-2xl border border-border/50 bg-[var(--iso-bg)] p-3 dark:border-white/5">
                  <PersonaVisual kind={persona.visual} />
                </div>
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
                  <persona.icon
                    className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                    strokeWidth={1.5}
                  />
                </div>
                <h3 className="mb-2 font-serif text-xl tracking-tight text-foreground">
                  {persona.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
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
