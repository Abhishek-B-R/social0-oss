import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DevScheduledPostPoller } from "@/components/DevScheduledPostPoller";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { SubscriptionSync } from "@/components/dashboard/SubscriptionSync";
import { getSubscriptionForUser } from "@/lib/subscription";

function getPlanLabel(tier: string): string {
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

  const subscription = await getSubscriptionForUser(session.user.id);
  const planLabel = getPlanLabel(subscription.tier);

  return (
    <div
      suppressHydrationWarning
      className="flex h-screen overflow-hidden bg-bg"
    >
      <SubscriptionSync tier={subscription.tier} />
      <DashboardSidebar user={session.user} planLabel={planLabel} />
      <main className="flex flex-1 flex-col min-h-0 overflow-y-auto pb-20 lg:pb-0">
        <div className="mx-auto flex min-h-full w-full max-w-[1200px] 2xl:max-w-7xl flex-1 flex-col pl-2 pr-4 py-6 sm:pl-4 sm:pr-6 lg:py-8 lg:px-8">
          {children}
        </div>
      </main>
      <DashboardBottomNav />
      <DevScheduledPostPoller />
    </div>
  );
}
