import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BulkToolsImageClient } from "@/components/bulk-tools/BulkToolsImageClient";
import { CONTENT_TYPES } from "@/lib/content-types";
import { PLATFORMS } from "@/lib/platforms";
import { NEVER_EXPIRES_PLATFORMS } from "@/lib/token-health";
import { checkBulkToolsAllowed } from "@/lib/plan-limits";
import { DOCS_BULK_TOOLS_IMAGE_URL } from "@/lib/docs-url";

const platformOrder: string[] = PLATFORMS.map((p) => p.id);
const IMAGE_PLATFORMS = new Set<string>(
  CONTENT_TYPES.find((c) => c.id === "image")?.platforms ?? [],
);

function sortAccounts<T extends { platform: string }>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) =>
      platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform),
  );
}

export default async function BulkToolsImagePage() {
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
      .filter((a) => a.isActive !== false && IMAGE_PLATFORMS.has(a.platform))
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
    <>
      <BulkToolsImageClient
        accounts={accounts}
        supportedPlatforms={Array.from(IMAGE_PLATFORMS)}
      />
      <a
        href={DOCS_BULK_TOOLS_IMAGE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <svg
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </a>
    </>
  );
}
