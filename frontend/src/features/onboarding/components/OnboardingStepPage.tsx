import type { ReactNode } from "react";
import { OnboardingBusy } from "./onboarding-ui";
import { PlansDialog } from "./PlansDialog";
import { usePlansDialog } from "./use-plans-dialog";
import { useCheckoutReturn } from "./use-checkout-return";

/**
 * Shared wrapper for each onboarding step: confirms a checkout that landed
 * back here (`?paid=1` / `?payment_failed=1`) and hosts the optional plans
 * dialog (`?plans=1`).
 */
export function OnboardingStepPage({
  children,
}: {
  children: (openPlans: () => void) => ReactNode;
}) {
  const verifying = useCheckoutReturn();
  const { open, setOpen } = usePlansDialog();

  if (verifying) return <OnboardingBusy label="Confirming your subscription…" />;

  return (
    <>
      {children(() => setOpen(true))}
      <PlansDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
