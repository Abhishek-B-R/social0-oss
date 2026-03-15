import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkAccountLimits } from "@/lib/plan-limits";
import { ConnectStepClient } from "./ConnectStepClient";
import { DOCS_ONBOARDING_CONNECT_URL } from "@/lib/docs-url";

export default async function OnboardingStep3Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const [accounts, accountLimit] = await Promise.all([
    db
      .select({
        id: connectedAccounts.id,
        platform: connectedAccounts.platform,
        platformUsername: connectedAccounts.platformUsername,
        profileImageUrl: connectedAccounts.profileImageUrl,
        isActive: connectedAccounts.isActive,
        isTwitterPremium: connectedAccounts.isTwitterPremium,
      })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, session.user.id),
          eq(connectedAccounts.isActive, true),
        ),
      ),
    checkAccountLimits(session.user.id, "linkedin"),
  ]);

  const accountsList = Array.isArray(accounts) ? accounts : [];

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
        <svg
          className="w-4 h-4"
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
      <ConnectStepClient
        initialAccounts={accountsList.map((a) => ({
          id: a.id,
          platform: a.platform,
          platformUsername: a.platformUsername,
          profileImageUrl: a.profileImageUrl,
          isActive: a.isActive,
          isTwitterPremium: a.isTwitterPremium ?? false,
        }))}
        limitTotal={accountLimit.limitTotal}
        hasUsedTrial={accountLimit.hasUsedTrial}
      />
    </>
  );
}
