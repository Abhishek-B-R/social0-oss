import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BulkToolsVideoClient } from "@/components/bulk-tools/BulkToolsVideoClient";
import { CONTENT_TYPES } from "@/lib/content-types";
import { PLATFORMS } from "@/lib/platforms";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/token-health";
import { checkBulkToolsAllowed } from "@/lib/plan-limits";

const platformOrder: string[] = PLATFORMS.map((p) => p.id);
const VIDEO_PLATFORMS = new Set<string>(
  CONTENT_TYPES.find((c) => c.id === "video")?.platforms ?? [],
);

function sortAccounts<T extends { platform: string }>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) =>
      platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform),
  );
}

export default async function BulkToolsVideoPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const bulkAllowed = await checkBulkToolsAllowed(session.user.id);
  if (!bulkAllowed) redirect("/dashboard/billing?upgrade=1");

  const all = await db.query.connectedAccounts.findMany({
    where: eq(connectedAccounts.userId, session.user.id),
    columns: {
      id: true,
      platform: true,
      platformUsername: true,
      profileImageUrl: true,
      isActive: true,
      tokenExpiresAt: true,
      tokenStatus: true,
      isTwitterPremium: true,
    },
  });

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const skipExpiryDisplay = new Set(["youtube", "tiktok"]);
  const accounts = sortAccounts(
    all
      .filter((a) => a.isActive !== false && VIDEO_PLATFORMS.has(a.platform))
      .map((a) => ({
        id: a.id,
        platform: a.platform,
        platformUsername: a.platformUsername,
        profileImageUrl: a.profileImageUrl,
        isActive: a.isActive,
        isTwitterPremium: a.isTwitterPremium ?? false,
        tokenExpired: NEVER_EXPIRES_PLATFORMS.has(a.platform)
          ? false
          : a.tokenStatus === "expired" ||
            (!skipExpiryDisplay.has(a.platform) &&
              !!a.tokenExpiresAt &&
              new Date(a.tokenExpiresAt).getTime() < now),
      })),
  );

  return (
    <BulkToolsVideoClient
      accounts={accounts}
      supportedPlatforms={Array.from(VIDEO_PLATFORMS)}
    />
  );
}
