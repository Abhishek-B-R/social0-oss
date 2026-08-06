import {
  FolderKanban,
  LayoutDashboard,
  Share2,
  Bot,
  Code2,
  Sparkles,
} from "lucide-react";
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
      label: "Use from Claude, ChatGPT, Cursor via MCP",
      Icon: Sparkles,
      iconBg: "bg-sky-500",
      pill: "border-sky-300 dark:border-sky-400/40",
    },
    {
      label: "Connect any AI agent",
      Icon: Code2,
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
      aria-label={
        mode === "agent" ? "Agent capabilities" : "Scheduling capabilities"
      }
    >
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2.5 sm:gap-3">
        {pills.map(({ label, Icon, iconBg, pill }) => (
          <div
            key={label}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border bg-transparent py-1.5 pl-1.5 pr-3.5 text-[12px] font-medium tracking-tight text-foreground sm:text-[13px] ${pill}`}
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
const CUSTOMER_COUNT = "212+";

const FACES = [
  { src: "/customers/c1.png", alt: "" },
  { src: "/customers/c2.jpg", alt: "" },
  { src: "/customers/c3.png", alt: "" },
  { src: "/customers/c4.png", alt: "" },
  { src: "/customers/c5.jpg", alt: "" },
  { src: "/customers/c6.jpg", alt: "" },
] as const;

/** Happy customers — under CTA + capability pills in the centered hero. */
export function AgentHappyCustomers({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-3 ${className}`}
    >
      <div className="flex items-center -space-x-2.5" aria-hidden>
        {FACES.map((face) => (
          <span
            key={face.src}
            className="relative flex size-8 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted dark:border-background"
          >
            <img
              src={face.src}
              alt={face.alt}
              width={32}
              height={32}
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </span>
        ))}
      </div>
      <p className="text-[14px] text-muted-foreground">
        Used by{" "}
        <span className="font-semibold text-foreground">{CUSTOMER_COUNT}</span>{" "}
        happy customers
      </p>
    </div>
  );
}
