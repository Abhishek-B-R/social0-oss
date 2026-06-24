import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { loadConnectionsPageData } from "@/app/actions/dashboard-data";
import { ConnectStepClient } from "@/app/onboarding/step3/ConnectStepClient";
import { DOCS_ONBOARDING_CONNECT_URL } from "@/lib/docs-url";

export default function OnboardingStep3Page() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const { data: connections } = useQuery({
    queryKey: ["onboarding-connections"],
    queryFn: loadConnectionsPageData,
    enabled: !!session,
  });

  useEffect(() => {
    if (!isPending && !session) navigate("/", { replace: true });
  }, [isPending, session, navigate]);

  if (!connections?.ok) return null;

  const { accounts, accountLimit } = connections.data;

  return (
    <>
      <a
        href={DOCS_ONBOARDING_CONNECT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-5 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </a>
      <ConnectStepClient
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
