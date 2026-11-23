import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { fetchApi } from "@/lib/fetch-api";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { planName } from "@/lib/plan-name";
import { isPaidPlan } from "@/components/billing/plan-catalog";
import {
  PAID_PARAM,
  PAYMENT_FAILED_PARAM,
  PLANS_PARAM,
} from "@/features/onboarding/lib/paths";

export const PAYMENT_FAILED_MESSAGE =
  "Payment didn't go through. Check your payment method and try again.";

function celebrate() {
  const end = Date.now() + 1_600;
  const colors = ["#10b981", "#34d399", "#6ee7b7"];
  const frame = () => {
    void confetti({
      particleCount: 2,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
      disableForReducedMotion: true,
    });
    void confetti({
      particleCount: 2,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

/** Same cadence as BillingPanel's post-checkout poll: every 2.5s for ~75s. */
const CONFIRM_INTERVAL_MS = 2_500;
const CONFIRM_MAX_ATTEMPTS = 30;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Confirmation = { active: true; tier: string | null } | { active: false };

/**
 * One confirmation attempt. `POST /api/billing/sync` pulls the subscription
 * from Dodo and answers `{ ok: false }` while the payment is still processing
 * (or 429 when rate limited), so fall back to `/api/auth/subscription-check`,
 * which also sees a plan the webhook already applied.
 */
async function confirmSubscription(): Promise<Confirmation> {
  try {
    const syncRes = await fetchApi("/api/billing/sync", {
      method: "POST",
      credentials: "include",
    });
    const sync = (await syncRes.json().catch(() => null)) as {
      ok?: boolean;
      tier?: string;
    } | null;
    if (sync?.ok === true && isPaidPlan(sync.tier)) return { active: true, tier: sync.tier };
  } catch {
    // Fall through to the read-only check.
  }
  try {
    const checkRes = await fetchApi("/api/auth/subscription-check", { credentials: "include" });
    if (!checkRes.ok) return { active: false };
    const check = (await checkRes.json().catch(() => null)) as {
      hasSubscription?: boolean;
    } | null;
    return check?.hasSubscription === true ? { active: true, tier: null } : { active: false };
  } catch {
    return { active: false };
  }
}

/**
 * Handles a billing checkout landing back on an onboarding step.
 *
 * - `?paid=1`: poll sync + subscription-check until the paid plan shows up.
 *   Found → refresh caches, celebrate, drop the params. Dodo's appended
 *   `status=failed` → the failed-payment path. Timeout → the payment is still
 *   clearing, so say so and let the webhook finish the upgrade.
 * - `?payment_failed=1`: toast and reopen the plans dialog so they can retry.
 *
 * Returns true while the subscription is being confirmed.
 */
export function useCheckoutReturn(): boolean {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const paid = searchParams.get(PAID_PARAM) === "1";
  const failed = searchParams.get(PAYMENT_FAILED_PARAM) === "1";
  const declined = paid && searchParams.get("status") === "failed";
  // Every exit from the confirm loop navigates away from `?paid=1`, so the
  // "confirming" screen is derived from the URL rather than held in state.
  const verifying = paid && !declined;

  useEffect(() => {
    if (!failed) return;
    toast.error(PAYMENT_FAILED_MESSAGE, { id: "onboarding-payment-failed" });
    navigate(`${pathname}?${PLANS_PARAM}=1`, { replace: true });
  }, [failed, pathname, navigate]);

  useEffect(() => {
    if (!paid) return;
    if (declined) {
      navigate(`${pathname}?${PAYMENT_FAILED_PARAM}=1`, { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      for (let attempt = 1; attempt <= CONFIRM_MAX_ATTEMPTS; attempt++) {
        const result = await confirmSubscription();
        if (cancelled) return;
        if (result.active) {
          invalidateQueries();
          celebrate();
          toast.success(
            result.tier
              ? `You're on ${planName(result.tier)}. Thanks for subscribing.`
              : "Your subscription is active. Thanks for subscribing.",
            { id: "onboarding-checkout-success" },
          );
          // Drop ?paid=1 and anything the payment page appended.
          navigate(pathname, { replace: true });
          return;
        }
        if (attempt < CONFIRM_MAX_ATTEMPTS) {
          await sleep(CONFIRM_INTERVAL_MS);
          if (cancelled) return;
        }
      }
      // Not a failure: the payment is still clearing. The webhook (or the
      // dashboard's SubscriptionSync) applies the plan once Dodo confirms it.
      invalidateQueries();
      toast.info("Still confirming your payment. We'll update your plan automatically.", {
        id: "onboarding-checkout-pending",
      });
      navigate(pathname, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [paid, declined, pathname, navigate, invalidateQueries]);

  return verifying;
}
