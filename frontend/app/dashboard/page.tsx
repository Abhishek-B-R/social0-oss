import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { OAuthErrorHandler } from "@/components/OAuthErrorHandler";
import { ConnectionsList } from "@/components/dashboard/ConnectionsList";

async function DashboardContent() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  const accounts = await db.query.connectedAccounts.findMany({
    where: eq(connectedAccounts.userId, session.user.id),
    columns: {
      id: true,
      platform: true,
      platformUsername: true,
      profileImageUrl: true,
      isActive: true,
    },
  });

  return (
    <>
      <OAuthErrorHandler />
      <ConnectionsList
        accounts={accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          platformUsername: a.platformUsername,
          profileImageUrl: a.profileImageUrl,
          isActive: a.isActive,
        }))}
      />
    </>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
