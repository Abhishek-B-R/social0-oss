import { Outlet } from "@tanstack/react-router";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardBottomNav } from "@/components/layout/dashboard-bottom-nav";

export function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-bg">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>
        <DashboardBottomNav />
      </div>
    </div>
  );
}
