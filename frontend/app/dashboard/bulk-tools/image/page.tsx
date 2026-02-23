import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BulkToolsImageClient } from "@/components/bulk-tools/BulkToolsImageClient";
import { CONTENT_TYPES } from "@/lib/content-types";
import { PLATFORMS } from "@/lib/platforms";

const platformOrder = PLATFORMS.map((p) => p.id);
const IMAGE_PLATFORMS = new Set(
  CONTENT_TYPES.find((c) => c.id === "image")?.platforms ?? [],
);

function sortAccounts<T extends { platform: string }>(accounts: T[]): T[] {
  return [...accounts].sort(
    (a, b) => platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform),
  );
}

export default async function BulkToolsImagePage() {
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
      (a) => a.isActive !== false && IMAGE_PLATFORMS.has(a.platform),
    ),
  );

  return <BulkToolsImageClient accounts={accounts} />;
}
