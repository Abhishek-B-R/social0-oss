import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkAccountLimits } from "@/lib/plan-limits";
import { ConnectStepClient } from "./ConnectStepClient";

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
  );
}
