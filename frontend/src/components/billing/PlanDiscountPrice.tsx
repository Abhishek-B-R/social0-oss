import { cn } from "@/lib/utils";

type PlanDiscountPriceProps = {
  amount: number;
  /** e.g. "/year" or "/month" */
  period: string;
  size?: "hero" | "md" | "sm";
  className?: string;
};

function formatAmount(amount: number): string {
  if (Number.isInteger(amount)) return amount.toLocaleString("en-US");
  return amount.toFixed(2);
}

/** Plan price: raised $, amount, muted period. No list / strike-through price. */
export function PlanDiscountPrice({
  amount,
  period,
  size = "md",
  className,
}: PlanDiscountPriceProps) {
  const priceClass =
    size === "hero"
      ? "font-sans text-[clamp(40px,7vw,56px)] font-bold leading-none tracking-tight tabular-nums text-foreground"
      : size === "sm"
        ? "font-sans text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground"
        : "font-sans text-3xl font-bold leading-none tracking-tight tabular-nums text-foreground";

  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2.5 gap-y-1", className)}>
      <span className={priceClass}>
        <sup className="mr-0.5 text-[0.55em] font-medium top-[-0.35em]">$</sup>
        {formatAmount(amount)}
      </span>
      <span className="text-[13px] text-muted-foreground">{period}</span>
    </div>
  );
}
