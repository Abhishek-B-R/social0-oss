import { useId, type ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import Link from "@/components/AppLink";
import { useDashboardPath } from "@/components/app";
import { PLAN_NAMES, type SellablePlanTier } from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * Shown in place of a feature the current plan does not include. The page
 * still renders (no silent redirect to billing): what the feature does, what
 * it unlocks, and one way to upgrade.
 */
export function LockedPlanPanel({
  title,
  description,
  points,
  plan = "creator",
  secondary,
  className,
}: {
  title: string;
  description: ReactNode;
  points?: string[];
  /** Lowest plan sold today that includes the feature. */
  plan?: SellablePlanTier;
  /** Optional extra action, e.g. a docs link. */
  secondary?: ReactNode;
  className?: string;
}) {
  const dash = useDashboardPath();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-xl">
          <p className="inline-flex items-center gap-1.5 text-[13px] text-text-muted">
            <Lock className="size-3.5" aria-hidden />
            Available on {PLAN_NAMES[plan]}
          </p>
          <h2
            id={titleId}
            className="mt-2 text-lg font-semibold tracking-tight text-text"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
          {points && points.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-text">
                  <Check className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
          <Link
            // `?upgrade=<plan>` opens Billing and starts that upgrade directly.
            href={dash(`billing?upgrade=${plan}`)}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
          >
            Upgrade to {PLAN_NAMES[plan]}
          </Link>
          <Link
            href={dash("billing?view=plans")}
            className="inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
          >
            Compare plans
          </Link>
          {secondary}
        </div>
      </div>
    </section>
  );
}
