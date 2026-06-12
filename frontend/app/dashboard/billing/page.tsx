import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInUrl } from "@/lib/sign-in-url";
import { BillingPageClient } from "./BillingPageClient";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(signInUrl("/dashboard/billing"));
  }

  return (
    <Suspense fallback={<DashboardPageSkeleton message="Loading billing..." />}>
      <BillingPageClient />
    </Suspense>
  );
}
