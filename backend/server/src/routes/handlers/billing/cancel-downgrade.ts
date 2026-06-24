import { auth } from "../../../lib/auth.js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "../../../db/index.js";
import { userSettings } from "../../../db/schema.js";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { pendingPlanTier: true },
  });

  if (!row?.pendingPlanTier) {
    return NextResponse.json(
      { error: "No pending downgrade to cancel" },
      { status: 400 },
    );
  }

  await db
    .update(userSettings)
    .set({ pendingPlanTier: null, downgradeReason: null })
    .where(eq(userSettings.userId, session.user.id));

  return NextResponse.json({ success: true });
}

