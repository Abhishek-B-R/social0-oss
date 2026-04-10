import { Suspense } from "react";
import { ConnectionsPageClient } from "./ConnectionsPageClient";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <ConnectionsPageClient />
    </Suspense>
  );
}
