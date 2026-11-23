import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardPath } from "@/components/app";
import { cn } from "@/lib/utils";
import { buildSetupSteps, canSeeSetup, setupProgress, useSetupVisibility } from "./setup";
import { useHomeData } from "./use-home-data";

function ProgressRing({ done, total, size = 18 }: { done: number; total: number; size?: number }) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-sidebar-border" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        className="stroke-accent transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
      />
    </svg>
  );
}

/**
 * Compact "Get set up · 2/5" pill for the sidebar. Renders only after the
 * user hid the checklist on Home and while required steps remain. Click
 * brings the checklist back on Home; × dismisses it for good.
 *
 * `collapsed`: icon-rail variant (progress ring only, label in the tooltip).
 */
export function SetupPill({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  const [visibility, setVisibility] = useSetupVisibility();
  const dash = useDashboardPath();
  const navigate = useNavigate();
  const { data } = useHomeData({ enabled: visibility === "hidden" });

  if (visibility !== "hidden" || !data || !canSeeSetup(data.permissions)) return null;
  const steps = buildSetupSteps(data.setup, data.permissions);
  const progress = setupProgress(steps);
  if (progress.complete) return null;

  const label = `Get set up · ${progress.done}/${progress.total}`;
  const open = () => {
    setVisibility("visible");
    navigate(dash("home"));
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={open}
        title={`${label}. Show the checklist on Home`}
        aria-label={`${label}. Show the checklist on Home`}
        className={cn(
          "mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          className,
        )}
      >
        <ProgressRing done={progress.done} total={progress.total} />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center rounded-lg border border-sidebar-border bg-sidebar-bg text-sidebar-text",
        className,
      )}
    >
      <button
        type="button"
        onClick={open}
        aria-label={`${label}. Show the checklist on Home`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-l-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <ProgressRing done={progress.done} total={progress.total} size={16} />
        <span className="truncate">Get set up</span>
        <span className="ml-auto tabular-nums text-sidebar-muted">
          {progress.done}/{progress.total}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setVisibility("dismissed")}
        aria-label="Don't show setup again"
        title="Don't show setup again"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-r-lg text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export default SetupPill;
