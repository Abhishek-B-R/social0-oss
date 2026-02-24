import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DevScheduledPostPoller } from "@/components/DevScheduledPostPoller";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <DashboardSidebar user={session.user} />
      <main className="flex flex-1 flex-col min-h-0 overflow-y-auto pb-20 lg:pb-0">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 lg:py-8 lg:px-8">
          {children}
        </div>
      </main>
      <DashboardBottomNav />
      <DevScheduledPostPoller />
    </div>
  );
}
