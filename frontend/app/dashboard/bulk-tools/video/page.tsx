import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BulkToolsVideoClient } from "@/components/bulk-tools/BulkToolsVideoClient";
import { CONTENT_TYPES } from "@/lib/content-types";
import { PLATFORMS } from "@/lib/platforms";

const platformOrder = PLATFORMS.map((p) => p.id);
const VIDEO_PLATFORMS = new Set(
  CONTENT_TYPES.find((c) => c.id === "video")?.platforms ?? [],
);

function sortAccounts<T extends { platform: string }>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) => platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform),
  );
}

export default async function BulkToolsVideoPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const all = await db.query.connectedAccounts.findMany({
    where: eq(connectedAccounts.userId, session.user.id),
    columns: {
      id: true,
      platform: true,
      platformUsername: true,
      profileImageUrl: true,
      isActive: true,
    },
  });

  const accounts = sortAccounts(
    all.filter(
      (a) => a.isActive !== false && VIDEO_PLATFORMS.has(a.platform),
    ),
  );

  return <BulkToolsVideoClient accounts={accounts} />;
}
