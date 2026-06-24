import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DevScheduledPostPoller } from "@/components/DevScheduledPostPoller";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { SubscriptionSync } from "@/components/dashboard/SubscriptionSync";
import { GuestBanner } from "@/components/dashboard/GuestBanner";
import { FreePostsBanner } from "@/components/dashboard/FreePostsBanner";
import { ConnectAccountsBanner } from "@/components/dashboard/ConnectAccountsBanner";
import { getSubscriptionForUser } from "@/lib/subscription";
import { getOnboardingStatus } from "@/app/actions/onboarding";
import { checkFreePostLimit } from "@/lib/plan-limits";
import { isActiveTier } from "@/lib/plans";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function getPlanLabel(tier: string): string {
  if (tier === "pro") return "Pro plan";
  if (tier === "growth") return "Growth plan";
  if (tier === "starter") return "Starter (Lite) plan";
  return "Free plan";
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    console.error("[DashboardLayout] Session lookup failed:", e);
    session = null;
  }

  const isGuest = !session;

  if (session?.user.emailVerified === false) {
    redirect(
      `/auth/verify-email?email=${encodeURIComponent(session.user.email ?? "")}`,
    );
  }

  let planLabel = "Guest";
  let subscriptionTier: string | null = null;
  let freePostsBanner: { remaining: number; limit: number } | null = null;
  let showConnectBanner = false;
  let profileRow: { name: string | null; image: string | null } | null = null;

  if (session) {
    const [onboarding, userProfile] = await Promise.all([
      getOnboardingStatus(),
      db.query.user.findFirst({
        where: eq(user.id, session.user.id),
        columns: { name: true, image: true },
      }),
    ]);
    profileRow = userProfile ?? null;
    const pathname = (await headers()).get("x-pathname") ?? "";
    const isConnectFlow = pathname.startsWith("/dashboard/connect");
    if (onboarding?.shouldOnboard && !isConnectFlow) {
      redirect("/onboarding");
    }
    showConnectBanner =
      onboarding != null &&
      onboarding.connectedAccountsCount === 0 &&
      !pathname.startsWith("/dashboard/connections");

    const subscription = await getSubscriptionForUser(session.user.id);
    subscriptionTier = subscription.tier;
    planLabel = getPlanLabel(subscription.tier);

    if (!isActiveTier(subscription.tier)) {
      const freeLimit = await checkFreePostLimit(session.user.id);
      freePostsBanner = {
        remaining: freeLimit.remaining,
        limit: freeLimit.limit,
      };
    }
  }

  const sidebarUser =
    session && profileRow
      ? {
          ...session.user,
          name: profileRow.name ?? session.user.name,
          image: profileRow.image ?? session.user.image,
        }
      : session?.user ?? null;

  return (
    <div
      suppressHydrationWarning
      className="flex h-screen overflow-hidden bg-bg"
    >
      {session && subscriptionTier && (
        <SubscriptionSync tier={subscriptionTier} />
      )}
      <DashboardSidebar
        user={sidebarUser}
        planLabel={planLabel}
        isGuest={isGuest}
      />
      <main className="flex flex-1 flex-col min-h-0 overflow-y-auto pb-80 mb-20 lg:mb-0 lg:pb-0">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1200px] 2xl:max-w-7xl flex-1 flex-col px-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-12 sm:pl-4 sm:pr-6 sm:pt-6 sm:pb-6 lg:px-8 lg:py-8 lg:pb-8">
          {isGuest && <GuestBanner />}
          {showConnectBanner && <ConnectAccountsBanner />}
          {freePostsBanner && (
            <FreePostsBanner
              remaining={freePostsBanner.remaining}
              limit={freePostsBanner.limit}
            />
          )}
          {children}
        </div>
      </main>
      <DashboardBottomNav />
      {session && <DevScheduledPostPoller />}
    </div>
  );
}
