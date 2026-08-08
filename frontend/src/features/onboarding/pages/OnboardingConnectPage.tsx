import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { fetchApi } from "@/lib/fetch-api";
import { useSession } from "@/lib/auth-client";
import { loadConnectionsPageData } from "@/api/dashboard-data";
import { ConnectStep } from "@/features/onboarding/components/ConnectStep";
import { CircleNotch } from "@/icons/phosphor";
import confetti from "canvas-confetti";
import {
  ONBOARDING_PATHS,
  ONBOARDING_PAYMENT_FAILED,
} from "@/features/onboarding/lib/paths";

/** Step 2 — connect accounts (primary activation). */
export default function OnboardingConnectPage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invalidateQueries = useInvalidateQueries();
  const paid = searchParams.get("paid") === "1";
  const [verifying, setVerifying] = useState(false);
  const syncAttempted = useRef(false);

  const { data: connections } = useQuery({
    queryKey: ["onboarding-connections"],
    queryFn: loadConnectionsPageData,
    enabled: !!session && !verifying,
  });

  useEffect(() => {
    if (!isPending && !session) navigate("/", { replace: true });
  }, [isPending, session, navigate]);

  // Legacy checkout return (?paid=1) may still land here from old emails/bookmarks.
  useEffect(() => {
    if (!paid || syncAttempted.current) return;
    syncAttempted.current = true;
    setVerifying(true);
    fetchApi("/api/billing/sync", { method: "POST", credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const hasPaidTier =
          data?.ok === true && data?.tier && data.tier !== "free";
        if (hasPaidTier) {
          invalidateQueries();
          const duration = 2_000;
          const end = Date.now() + duration;
          const frame = () => {
            confetti({
              particleCount: 2,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors: ["#10b981", "#34d399", "#6ee7b7"],
            });
            confetti({
              particleCount: 2,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors: ["#10b981", "#34d399", "#6ee7b7"],
            });
            if (Date.now() < end) requestAnimationFrame(frame);
          };
          frame();
          setVerifying(false);
          navigate(ONBOARDING_PATHS.connect, { replace: true });
        } else {
          setVerifying(false);
          navigate(ONBOARDING_PAYMENT_FAILED, { replace: true });
        }
      })
      .catch(() => {
        setVerifying(false);
        navigate(ONBOARDING_PAYMENT_FAILED, { replace: true });
      });
  }, [paid, navigate, invalidateQueries]);

  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <CircleNotch className="h-8 w-8 shrink-0 animate-spin text-emerald-500" />
        <p className="text-sm text-muted-foreground">
          Confirming your subscription…
        </p>
      </div>
    );
  }

  if (!connections?.ok) return null;

  const { accounts, accountLimit } = connections.data;

  return (
    <ConnectStep
      initialAccounts={accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        platformUsername: a.platformUsername,
        profileImageUrl: a.profileImageUrl,
        isActive: a.isActive,
      }))}
      limitTotal={accountLimit?.limitTotal ?? 0}
      hasUsedTrial={accountLimit?.hasUsedTrial ?? false}
    />
  );
}
