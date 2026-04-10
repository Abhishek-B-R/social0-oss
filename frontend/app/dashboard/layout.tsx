import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DevScheduledPostPoller } from "@/components/DevScheduledPostPoller";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { SubscriptionSync } from "@/components/dashboard/SubscriptionSync";
import { getSubscriptionForUser } from "@/lib/subscription";
import { getOnboardingStatus } from "@/app/actions/onboarding";

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
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    console.error("[DashboardLayout] Session lookup failed:", e);
    redirect("/");
  }

  if (!session) {
    redirect("/");
  }

  if (session.user.emailVerified === false) {
    redirect(
      `/auth/verify-email?email=${encodeURIComponent(session.user.email ?? "")}`,
    );
  }

  const onboarding = await getOnboardingStatus();
  // Allow connect flow (e.g. Instagram page selection) so users can complete OAuth and return to onboarding/step3 or connections
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isConnectFlow = pathname.startsWith("/dashboard/connect");
  if (onboarding?.shouldOnboard && !isConnectFlow) {
    redirect("/onboarding");
  }

  const subscription = await getSubscriptionForUser(session.user.id);
  const planLabel = getPlanLabel(subscription.tier);

  return (
    <div
      suppressHydrationWarning
      className="flex h-screen overflow-hidden bg-bg"
    >
      <SubscriptionSync tier={subscription.tier} />
      <DashboardSidebar user={session.user} planLabel={planLabel} />
      <main className="flex flex-1 flex-col min-h-0 overflow-y-auto pb-80 mb-20 lg:mb-0 lg:pb-0">
        <div className="mx-auto flex min-h-full w-full max-w-[1200px] 2xl:max-w-7xl flex-1 flex-col px-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-12 sm:pl-4 sm:pr-6 sm:pt-6 sm:pb-6 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </div>
      </main>
      <DashboardBottomNav />
      <DevScheduledPostPoller />
    </div>
  );
}
