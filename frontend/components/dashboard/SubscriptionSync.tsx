"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type SubscriptionSyncProps = {
  tier: string;
};

/**
 * When the user is on "free" tier, try once to sync subscription from Polar (by email).
 * If we find an active subscription, DB is updated and we refresh so the UI shows the correct plan.
 */
export function SubscriptionSync({ tier }: SubscriptionSyncProps) {
  const router = useRouter();
  const didRun = useRef(false);

  useEffect(() => {
    if (tier !== "free" || didRun.current) return;
    didRun.current = true;

    fetch("/api/billing/sync", { method: "POST", credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok === true && (data.tier === "starter" || data.tier === "growth")) {
          router.refresh();
        }
      })
      .catch(() => {
        // ignore
      });
  }, [tier, router]);

  return null;
}
