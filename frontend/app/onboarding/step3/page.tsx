import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkAccountLimits } from "@/lib/plan-limits";
import { ConnectStepClient } from "./ConnectStepClient";
import { MdQuestionMark } from "react-icons/md";
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
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
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
      />
    </>
  );
}
