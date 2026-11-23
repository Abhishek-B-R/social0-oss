import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AGENCY_INCLUDED_ACCOUNTS,
  isLegacyTier,
  type BillingInterval,
  type PaidPlanTier,
  type SubscriptionTier,
} from "@/lib/plans";
import { formatMoney } from "@/lib/plan-pricing";
import {
  lostOnDowngrade,
  periodPrice,
  planName,
} from "@/components/billing/plan-catalog";
import { cn } from "@/lib/utils";
import { formatPreviewAmount } from "./billing-api";
import type { UpgradeConfirm } from "./use-billing-flows";

function priceLabel(plan: PaidPlanTier, interval: BillingInterval, extraAccounts = 0): string {
  return `$${formatMoney(periodPrice(plan, interval, extraAccounts))}/${interval === "yearly" ? "year" : "month"}`;
}

/** "Agency (62 accounts)" for Agency with extras, else the plan name. */
function planWithAccounts(plan: PaidPlanTier, extraAccounts = 0): string {
  return plan === "agency" && extraAccounts > 0
    ? `${planName(plan)} (${AGENCY_INCLUDED_ACCOUNTS + extraAccounts} accounts)`
    : planName(plan);
}

function StepLabel({ step }: { step: 1 | 2 }) {
  return (
    <p className="text-xs font-medium text-text-muted">Step {step} of 2</p>
  );
}

function LossList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "warning" | "danger";
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "danger"
          ? "border-danger-border bg-danger-soft"
          : "border-warning-border bg-warning-soft",
      )}
    >
      <p className="mb-2.5 text-sm font-medium text-text">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-text-muted">
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-1.5 shrink-0 rounded-full",
                tone === "danger" ? "bg-danger" : "bg-warning-solid",
              )}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackField({
  value,
  onChange,
  label,
  note,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  note: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Please share your reason..."
        className="min-h-32 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      <p className="whitespace-pre-line text-xs text-text-muted">{note}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upgrade timing: now (prorated charge) vs on renewal (no charge today)

export function UpgradeTimingDialog({
  confirm,
  renewalDate,
  cancelAtPeriodEnd,
  loading,
  action,
  onConfirm,
  onClose,
}: {
  confirm: UpgradeConfirm | null;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  action: "now" | "renewal" | null;
  onConfirm: (when: "now" | "renewal") => void;
  onClose: () => void;
}) {
  const optionCls =
    "w-full rounded-xl border border-border bg-bg-elevated p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50";
  return (
    <Dialog open={confirm != null} onOpenChange={(open) => (!open && !loading ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upgrade to {confirm ? planName(confirm.plan) : ""}</DialogTitle>
          <DialogDescription>
            {confirm
              ? `${planWithAccounts(confirm.plan, confirm.extraAccounts)} is ${priceLabel(confirm.plan, confirm.interval, confirm.extraAccounts)}. Choose when the upgrade takes effect.`
              : "Choose when the upgrade takes effect."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onConfirm("now")}
            disabled={loading || !confirm}
            className={optionCls}
          >
            <p className="font-medium text-text">
              {action === "now" ? "Processing…" : "Upgrade now"}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {confirm?.preview
                ? `Charge ${formatPreviewAmount(confirm.preview)} on your saved payment method`
                : "Charge the prorated difference on your saved payment method"}
              . The new plan unlocks as soon as the payment goes through.
            </p>
            {cancelAtPeriodEnd ? (
              <p className="mt-1 text-xs text-accent">
                Your cancellation will be removed after the upgrade.
              </p>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => onConfirm("renewal")}
            disabled={loading || !confirm}
            className={optionCls}
          >
            <p className="font-medium text-text">
              {action === "renewal" ? "Scheduling…" : "Upgrade on renewal"}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              No payment today · Starts on {renewalDate ?? "your renewal date"}
            </p>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Downgrade: reason → confirm (scheduled at period end)

export function DowngradeDialog({
  target,
  targetExtraAccounts = 0,
  currentTier,
  currentExtraAccounts = 0,
  interval,
  renewalDate,
  cancelAtPeriodEnd,
  loading,
  onSchedule,
  onClose,
}: {
  target: PaidPlanTier | null;
  /** Agency target only: extras the user picked. */
  targetExtraAccounts?: number;
  currentTier: SubscriptionTier;
  currentExtraAccounts?: number;
  interval: BillingInterval;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
  onSchedule: (plan: PaidPlanTier, reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const close = () => {
    if (loading) return;
    setStep(1);
    setReason("");
    onClose();
  };
  const lost = target ? lostOnDowngrade(currentTier, target, currentExtraAccounts) : [];
  // Moving off a plan that isn't sold anymore isn't always a downgrade.
  const verb = isLegacyTier(currentTier) ? "switch" : "downgrade";
  return (
    <Dialog open={target != null} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <StepLabel step={step} />
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Before you {verb}</DialogTitle>
              <DialogDescription>What made you decide to {verb}?</DialogDescription>
            </DialogHeader>
            <FeedbackField
              value={reason}
              onChange={setReason}
              label={verb === "switch" ? "Why are you switching?" : "Why are you downgrading?"}
              note={
                <>
                  this helps me understand what&apos;s missing. i&apos;ll read every
                  response and use it to improve Social0.{"\n"}- abhishek (the person who
                  built + runs social0)
                </>
              }
            />
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={loading}>
                Close
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={loading || reason.trim().length === 0}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : target ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {verb === "switch" ? "Switch" : "Downgrade"} to {planName(target)}?
              </DialogTitle>
              <DialogDescription>
                You&apos;ll stay on {planName(currentTier)} until{" "}
                {renewalDate ?? "your renewal date"}. After that your plan switches to{" "}
                {planWithAccounts(target, targetExtraAccounts)} (
                {priceLabel(target, interval, targetExtraAccounts)}). You won&apos;t be charged
                now.
              </DialogDescription>
            </DialogHeader>
            {cancelAtPeriodEnd ? (
              <p className="text-sm text-warning">
                Your cancellation will be replaced with a downgrade at the end of your billing
                cycle.
              </p>
            ) : null}
            <LossList title="You'll lose access to:" items={lost} tone="warning" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
                Back
              </Button>
              <Button
                onClick={async () => {
                  const ok = await onSchedule(target, reason);
                  if (ok) {
                    setStep(1);
                    setReason("");
                    onClose();
                  }
                }}
                disabled={loading}
                className="bg-warning-solid text-warning-solid-foreground hover:brightness-105"
              >
                {loading
                  ? "Scheduling…"
                  : verb === "switch"
                    ? "Schedule switch"
                    : "Schedule downgrade"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Cancel: feedback → confirm

const CANCEL_LOSSES = [
  "Multi-platform posting (9 platforms)",
  "Content scheduling",
  "Bulk scheduling tools",
  "Auto-repost & Auto-plug",
  "Connected accounts get disconnected after 30 days",
];

export function CancelDialog({
  open,
  loading,
  renewalDate,
  onCancel,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  renewalDate: string | null;
  onCancel: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const close = () => {
    if (loading) return;
    setStep(1);
    setReason("");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <StepLabel step={step} />
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Please tell us how we can do better</DialogTitle>
              <DialogDescription>What made you cancel your subscription?</DialogDescription>
            </DialogHeader>
            <FeedbackField
              value={reason}
              onChange={setReason}
              label="Why are you cancelling?"
              note={
                <>
                  the feedback you put here matters to me. i will pay attention and improve
                  Social0 based on it, thank you for your time.{"\n"}- abhishek (the person
                  who built + runs social0)
                </>
              }
            />
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={loading}>
                Close
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={loading || reason.trim().length === 0}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cancel your subscription?</DialogTitle>
              <DialogDescription>
                Thanks for the feedback. Your subscription ends on{" "}
                {renewalDate ?? "the last day of this billing period"} and you keep full
                access until then. No further charges.
              </DialogDescription>
            </DialogHeader>
            <LossList
              title="After your period ends, you'll lose access to:"
              items={CANCEL_LOSSES}
              tone="danger"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
                Back
              </Button>
              <Button
                variant="destructive"
                disabled={loading}
                onClick={async () => {
                  const ok = await onCancel(reason);
                  if (ok) {
                    setStep(1);
                    setReason("");
                    onClose();
                  }
                }}
              >
                {loading ? "Cancelling…" : "Cancel subscription"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Interval switch (yearly nudge on the plan card, or the current plan in the grid)

export function SwitchIntervalDialog({
  plan,
  extraAccounts = 0,
  to,
  loading,
  renewalDate,
  cancelAtPeriodEnd,
  onConfirm,
  onClose,
}: {
  plan: PaidPlanTier | null;
  /** Agency: paid extras, kept across the switch. */
  extraAccounts?: number;
  to: BillingInterval;
  loading: boolean;
  renewalDate: string | null;
  /** The switch runs through the immediate change-plan path, which lifts a pending cancellation. */
  cancelAtPeriodEnd: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const yearly = plan ? periodPrice(plan, "yearly", extraAccounts) : 0;
  const monthly = plan ? periodPrice(plan, "monthly", extraAccounts) : 0;
  return (
    <Dialog open={plan != null} onOpenChange={(o) => (!o && !loading ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Switch to {to === "yearly" ? "yearly" : "monthly"} billing
          </DialogTitle>
          <DialogDescription>
            {plan && to === "yearly"
              ? `${planWithAccounts(plan, extraAccounts)} becomes $${formatMoney(yearly)}/year instead of $${formatMoney(monthly * 12)} paid monthly. We charge the prorated difference on your saved payment method today.`
              : plan
                ? `${planWithAccounts(plan, extraAccounts)} becomes $${formatMoney(monthly)}/month. The switch takes effect now and any prorated difference is settled on your saved payment method${renewalDate ? ` (current period ends ${renewalDate})` : ""}.`
                : null}
          </DialogDescription>
        </DialogHeader>
        {cancelAtPeriodEnd ? (
          <p className="text-sm text-accent">
            Your cancellation will be removed after the switch, and the plan renews{" "}
            {to === "yearly" ? "yearly" : "monthly"}.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Not now
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "Switching…" : `Switch to ${to}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
