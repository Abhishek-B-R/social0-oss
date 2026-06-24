import { useMutation } from "@tanstack/react-query";
import { billingService } from "@/services/billing.service";
import { PLAN_DISPLAY } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const TIERS = ["starter", "growth", "pro"] as const;

export function BillingPage() {
  const checkout = useMutation({
    mutationFn: (tier: "starter" | "growth" | "pro") =>
      billingService.checkout({ tier }),
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const portal = useMutation({
    mutationFn: () => billingService.portal(),
    onSuccess: (data) => {
      window.location.href = data.portalUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: () => billingService.sync(),
    onSuccess: (data) => {
      toast.success(data.tier ? `Synced: ${data.tier}` : "Synced");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-text-muted">Manage your subscription and plan.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>
          Customer portal
        </Button>
        <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
          Sync subscription
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier}
            className="rounded-xl border border-border bg-bg-elevated p-5"
          >
            <h3 className="font-semibold">{PLAN_DISPLAY[tier].name}</h3>
            <p className="mt-1 text-2xl font-bold">{PLAN_DISPLAY[tier].price}</p>
            <Button
              className="mt-4 w-full"
              onClick={() => checkout.mutate(tier)}
              disabled={checkout.isPending}
            >
              Upgrade
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
