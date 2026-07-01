import { useNavigate } from "react-router-dom";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { fetchApi } from "@/lib/fetch-api";

import { useEffect, useRef } from "react";

const SYNC_SESSION_KEY = "billing_sync_attempted";

type SubscriptionSyncProps = {
  tier: string;
};

/**
 * When the user is on "free" tier, try once per session to sync subscription from Dodo Payments (by email).
 * If we find an active subscription, DB is updated and we refresh so the UI shows the correct plan.
 * Uses sessionStorage so we don't bombard the API on every dashboard navigation.
 */
export function SubscriptionSync({ tier }: SubscriptionSyncProps) {
  const navigate = useNavigate();
  const invalidateQueries = useInvalidateQueries();
  const didRun = useRef(false);

  useEffect(() => {
    if (tier !== "free") return;
    try {
      if (sessionStorage.getItem(SYNC_SESSION_KEY) === "1") return;
    } catch {
      // sessionStorage unavailable
    }
    if (didRun.current) return;
    didRun.current = true;

    fetchApi("/api/billing/sync", { method: "POST", credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        try {
          sessionStorage.setItem(SYNC_SESSION_KEY, "1");
        } catch {
          // ignore
        }
        if (
          data?.ok === true &&
          (data.tier === "starter" || data.tier === "growth" || data.tier === "pro")
        ) {
          invalidateQueries();
        }
      })
      .catch(() => {
        try {
          sessionStorage.setItem(SYNC_SESSION_KEY, "1");
        } catch {
          // ignore
        }
      });
  }, [tier, invalidateQueries]);

  return null;
}
