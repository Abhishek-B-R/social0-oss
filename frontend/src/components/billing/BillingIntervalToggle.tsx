import type { BillingInterval } from "@/lib/plans";

type BillingIntervalToggleProps = {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  className?: string;
  /** Compact label for dense layouts (onboarding / billing). */
  size?: "default" | "sm";
};

export function BillingIntervalToggle({
  value,
  onChange,
  className = "",
  size = "default",
}: BillingIntervalToggleProps) {
  const pad =
    size === "sm"
      ? "px-3 py-1.5 text-xs touch:min-h-10 touch:px-4"
      : "px-4 py-2 text-sm touch:min-h-11";
  // Yearly is 10× monthly on every plan sold: two months free.
  const yearlyLabel = "Yearly";

  return (
    <div
      className={`inline-flex items-center rounded-full border border-border bg-muted/50 p-1 ${className}`}
      role="group"
      aria-label="Billing interval"
    >
      <button
        type="button"
        onClick={() => onChange("monthly")}
        aria-pressed={value === "monthly"}
        className={`inline-flex items-center justify-center rounded-full font-medium transition-colors touch-manipulation ${pad} ${
          value === "monthly"
            ? "bg-foreground text-background shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("yearly")}
        aria-pressed={value === "yearly"}
        className={`inline-flex items-center justify-center rounded-full font-medium transition-colors touch-manipulation ${pad} ${
          value === "yearly"
            ? "bg-foreground text-background shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {yearlyLabel}
        <span
          className={`ml-1.5 rounded-full px-1.5 py-px text-[11px] font-medium ${
            value === "yearly" ? "bg-background/20" : "bg-accent/10 text-accent"
          }`}
        >
          2 months free
        </span>
      </button>
    </div>
  );
}
