import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import { db } from "../../db/index.js";
import { userSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";


export async function cancelDowngrade() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { pendingPlanTier: true },
  });

  if (!row?.pendingPlanTier) {
    return RouteResponse.json(
      { error: "No pending downgrade to cancel" },
      { status: 400 },
    );
  }

  await db
    .update(userSettings)
    .set({ pendingPlanTier: null, downgradeReason: null })
    .where(eq(userSettings.userId, session.user.id));

  return RouteResponse.json({ success: true });
}

