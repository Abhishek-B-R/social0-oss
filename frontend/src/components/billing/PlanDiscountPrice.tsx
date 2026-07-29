import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PlanDiscountPriceProps = {
  /** Struck original / list amount (omit when no discount). */
  listAmount?: number | null;
  /** Current / discounted amount. */
  amount: number;
  /** e.g. "/year" or "/month" */
  period: string;
  size?: "hero" | "md" | "sm";
  className?: string;
  /** Extra badge beside the row (Save X%, etc.) */
  badge?: ReactNode;
};

function formatAmount(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  if (Math.abs(amount * 10 - Math.round(amount * 10)) < 1e-9) {
    return amount.toFixed(1);
  }
  return amount.toFixed(2);
}

/**
 * Launch / yearly discount display: list price first (same-color slash),
 * then sale price, then muted period — matches clean pricing card pattern.
 */
export function PlanDiscountPrice({
  listAmount,
  amount,
  period,
  size = "md",
  className,
  badge,
}: PlanDiscountPriceProps) {
  const hasList =
    listAmount != null &&
    Number.isFinite(listAmount) &&
    listAmount > amount;

  const priceClass =
    size === "hero"
      ? "font-serif text-[clamp(40px,7vw,56px)] leading-none tracking-tight text-foreground"
      : size === "sm"
        ? "font-serif text-2xl font-bold leading-none tracking-tight text-foreground"
        : "font-serif text-3xl font-semibold leading-none tracking-tight text-foreground";

  const listClass =
    size === "hero"
      ? "font-serif text-[clamp(28px,5vw,36px)] leading-none tracking-tight text-foreground/55"
      : size === "sm"
        ? "font-serif text-xl leading-none tracking-tight text-foreground/55"
        : "font-serif text-2xl leading-none tracking-tight text-foreground/55";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {hasList ? (
          <span
            className={cn(
              listClass,
              "line-through decoration-foreground/45 decoration-[1.5px]",
            )}
          >
            <sup className="mr-0.5 text-[0.55em] font-medium top-[-0.35em]">
              $
            </sup>
            {formatAmount(listAmount!)}
          </span>
        ) : null}
        <span className={priceClass}>
          <sup className="mr-0.5 text-[0.55em] font-medium top-[-0.35em]">$</sup>
          {formatAmount(amount)}
        </span>
        <span className="text-[13px] text-muted-foreground">{period}</span>
        {badge}
      </div>
    </div>
  );
}
