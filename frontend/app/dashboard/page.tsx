import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PLATFORMS } from "@/lib/platforms";
import { PlatformCard } from "@/components/PlatformCard";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { headers } from "next/headers";
import { Suspense } from "react";
import { OAuthErrorHandler } from "@/components/OAuthErrorHandler";

async function DashboardContent() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  // Fetch connected accounts
  const accounts = await db.query.connectedAccounts.findMany({
    where: eq(connectedAccounts.userId, session.user.id),
  });

  const connectedMap = new Map(accounts.map((a) => [a.platform, a]));

  return (
    <>
      <OAuthErrorHandler />
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Connect your accounts
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORMS.map((platform) => {
            const account = connectedMap.get(platform.id);
            return (
              <PlatformCard
                key={platform.id}
                platform={platform}
                account={
                  account
                    ? {
                        platformUsername: account.platformUsername,
                        profileImageUrl: account.profileImageUrl,
                        isActive: account.isActive ?? false,
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>
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
