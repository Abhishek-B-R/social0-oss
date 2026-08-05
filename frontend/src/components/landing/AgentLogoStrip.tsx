import { FolderKanban, LayoutDashboard, Share2, Bot, Code2, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLandingMode, type LandingMode } from "./landing-mode";

type Pill = {
  label: string;
  Icon: LucideIcon;
  iconBg: string;
  pill: string;
};

const PILLS_BY_MODE: Record<LandingMode, Pill[]> = {
  agent: [
    {
      label: "Connect any AI agent",
      Icon: Code2,
      iconBg: "bg-sky-500",
      pill: "border-sky-300 dark:border-sky-400/40",
    },
    {
      label: "Use from Claude, ChatGPT via MCP",
      Icon: Sparkles,
      iconBg: "bg-emerald-500",
      pill: "border-emerald-300 dark:border-emerald-400/40",
    },
    {
      label: "Connect your OpenClaw/Hermes agent",
      Icon: Bot,
      iconBg: "bg-rose-500",
      pill: "border-rose-300 dark:border-rose-400/40",
    },
  ],
  normal: [
    {
      label: "Publish to 9 platforms in one click",
      Icon: Share2,
      iconBg: "bg-sky-500",
      pill: "border-sky-300 dark:border-sky-400/40",
    },
    {
      label: "Separate workspaces for each brand or niche",
      Icon: FolderKanban,
      iconBg: "bg-emerald-500",
      pill: "border-emerald-300 dark:border-emerald-400/40",
    },
    {
      label: "One dashboard for all your content",
      Icon: LayoutDashboard,
      iconBg: "bg-rose-500",
      pill: "border-rose-300 dark:border-rose-400/40",
    },
  ],
};

/**
 * Compact capability pills — equal gaps, soft accent tints.
 */
export function AgentLogoStrip({ className = "" }: { className?: string }) {
  const { mode } = useLandingMode();
  const pills = PILLS_BY_MODE[mode];

  return (
    <div
      className={`px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8 ${className}`}
      aria-label={mode === "agent" ? "Agent capabilities" : "Scheduling capabilities"}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center gap-2.5 sm:w-[92%] sm:flex-row sm:flex-nowrap sm:justify-center sm:gap-3 lg:w-[90%]">
        {pills.map(({ label, Icon, iconBg, pill }) => (
          <div
            key={label}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border bg-transparent py-1.5 pl-1.5 pr-3.5 text-[11px] font-medium tracking-tight text-foreground sm:text-[12px] ${pill}`}
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full ${iconBg}`}
            >
              <Icon className="size-2.5 text-white" strokeWidth={2.5} />
            </span>
            <span className="leading-none whitespace-nowrap">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** PLACEHOLDER count — edit when you have the real number */
const CUSTOMER_COUNT = "212";

const FACES = [
  { initials: "MC", bg: "bg-amber-400 text-amber-950" },
  { initials: "JB", bg: "bg-sky-500 text-white" },
  { initials: "PN", bg: "bg-violet-500 text-white" },
  { initials: "AK", bg: "bg-emerald-600 text-white", src: "/pfp.webp" },
  { initials: "RL", bg: "bg-rose-500 text-white" },
] as const;

/** Happy customers — sits under Start free in the hero. */
export function AgentHappyCustomers({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2.5 lg:justify-start ${className}`}
    >
      <div className="flex items-center -space-x-2" aria-hidden>
        {FACES.map((face) => (
          <span
            key={face.initials}
            className={`relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-background text-[9px] font-semibold dark:border-background ${face.bg}`}
          >
            {"src" in face && face.src ? (
              <img
                src={face.src}
                alt=""
                width={28}
                height={28}
                className="h-full w-full object-cover"
              />
            ) : (
              face.initials
            )}
          </span>
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground">
        Used by{" "}
        <span className="font-semibold text-foreground">{CUSTOMER_COUNT}</span>{" "}
        happy customers
      </p>
    </div>
  );
}
