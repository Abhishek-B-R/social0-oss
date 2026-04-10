import { Suspense } from "react";
import { BillingPageClient } from "./BillingPageClient";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export default function BillingPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <BillingPageClient />
    </Suspense>
  );
}
