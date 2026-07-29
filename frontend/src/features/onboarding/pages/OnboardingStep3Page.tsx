import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { fetchApi } from "@/lib/fetch-api";
import { useSession } from "@/lib/auth-client";
import { loadConnectionsPageData } from "@/api/dashboard-data";
import { ConnectStep } from "@/features/onboarding/components/ConnectStep";
import { DOCS_ONBOARDING_CONNECT_URL } from "@/lib/docs-url";
import {
  CircleNotch,
} from "@/icons/phosphor";
import confetti from "canvas-confetti";

export default function OnboardingStep3Page() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invalidateQueries = useInvalidateQueries();
  const paid = searchParams.get("paid") === "1";
  const [verifying, setVerifying] = useState(paid);
  const syncAttempted = useRef(false);

  const { data: connections } = useQuery({
    queryKey: ["onboarding-connections"],
    queryFn: loadConnectionsPageData,
    enabled: !!session && !verifying,
  });

  useEffect(() => {
    if (!isPending && !session) navigate("/", { replace: true });
  }, [isPending, session, navigate]);

  // After checkout return: sync subscription, celebrate, then show connect.
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
          navigate("/onboarding/step3", { replace: true });
        } else {
          setVerifying(false);
          navigate("/onboarding/step2?payment_failed=1", { replace: true });
        }
      })
      .catch(() => {
        setVerifying(false);
        navigate("/onboarding/step2?payment_failed=1", { replace: true });
      });
  }, [paid, navigate, invalidateQueries]);

  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <CircleNotch
          className="h-8 w-8 shrink-0 animate-spin text-accent"
        />
        <p className="text-sm text-muted-foreground">
          Confirming your subscription…
        </p>
      </div>
    );
  }

  if (!connections?.ok) return null;

  const { accounts, accountLimit } = connections.data;

  return (
    <>
      <a
        href={DOCS_ONBOARDING_CONNECT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-5 right-4 z-10 flex items-center gap-2 rounded-full p-1.5 text-text-muted transition-colors hover:bg-muted hover:text-text sm:right-6 lg:right-10"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <svg
          className="h-4 w-4"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </a>
      <ConnectStep
        initialAccounts={accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          platformUsername: a.platformUsername,
          profileImageUrl: a.profileImageUrl,
          isActive: a.isActive,
          isTwitterPremium: a.isTwitterPremium ?? false,
        }))}
        limitTotal={accountLimit?.limitTotal ?? 0}
        hasUsedTrial={accountLimit?.hasUsedTrial ?? false}
      />
    </>
  );
}
