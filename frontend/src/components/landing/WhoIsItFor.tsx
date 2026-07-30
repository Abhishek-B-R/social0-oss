import { AnimatePresence, motion } from "framer-motion";
import { Bot, Code, Megaphone, Terminal, Video, Zap } from "lucide-react";
import {
  WfBuilder,
  WfCreator,
  WfMarketer,
} from "./wireframes/ProductWireframes";
import { WireframeStage } from "./wireframes/WireframeStage";
import { useLandingMode, type LandingMode } from "./landing-mode";

const personasByMode = {
  normal: {
    headline: "Built for people who actually post",
    personas: [
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
    ],
  },
  agent: {
    headline: "Built for agents that actually ship",
    personas: [
      {
        title: "AI builders & agents",
        description:
          "Wire Social0 into Cursor or Claude via MCP — agents draft, schedule, and publish without a dashboard tab.",
        icon: Bot,
        visual: "builder" as const,
      },
      {
        title: "Automation teams",
        description:
          "Hook Zapier, Make, or n8n into the same publish pipeline your humans use — reliable, logged, multi-platform.",
        icon: Zap,
        visual: "creator" as const,
      },
      {
        title: "CLI & API power users",
        description:
          "Script posts from the terminal or your stack. Official CLI and REST API, same engines as the app.",
        icon: Terminal,
        visual: "marketer" as const,
      },
    ],
  },
} satisfies Record<
  LandingMode,
  {
    headline: string;
    personas: {
      title: string;
      description: string;
      icon: typeof Code;
      visual: "builder" | "creator" | "marketer";
    }[];
  }
>;

function PersonaVisual({ kind }: { kind: "builder" | "creator" | "marketer" }) {
  if (kind === "builder") return <WfBuilder className="h-[140px] w-full" />;
  if (kind === "creator") return <WfCreator className="h-[140px] w-full" />;
  return <WfMarketer className="h-[140px] w-full" />;
}

export function WhoIsItFor() {
  const { mode } = useLandingMode();
  const { headline, personas } = personasByMode[mode];

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <AnimatePresence mode="wait">
            <motion.h2
              key={mode}
              className="max-w-md font-serif text-[clamp(28px,4vw,40px)] italic leading-tight text-muted-foreground"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            >
              {headline}
            </motion.h2>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            className="grid gap-4 md:grid-cols-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
          >
            {personas.map((persona) => (
              <div
                key={persona.title}
                className="group relative overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-[#1A1A1A]"
              >
                <div className="flex h-full flex-col rounded-[22px] border border-border/60 bg-background p-5 dark:border-white/5 dark:bg-[#111111] sm:p-6">
                  <WireframeStage className="mb-5" tall>
                    <PersonaVisual kind={persona.visual} />
                  </WireframeStage>
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
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
