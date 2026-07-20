import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import DodoPayments from "dodopayments";
import { db } from "../../db/index.js";
import { userSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../../lib/env.js";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";

export async function cancelDowngrade() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { pendingPlanTier: true, subscriptionId: true },
  });

  if (!row?.pendingPlanTier) {
    return RouteResponse.json(
      { error: "No pending plan change to cancel" },
      { status: 400 },
    );
  }

  if (apiKey && row.subscriptionId) {
    const client = new DodoPayments({ bearerToken: apiKey, environment });
    try {
      await client.subscriptions.cancelChangePlan(row.subscriptionId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) {
        console.warn("[billing/cancel-downgrade] cancelChangePlan:", msg);
      }
    }
  }

  await db
    .update(userSettings)
    .set({ pendingPlanTier: null, downgradeReason: null })
    .where(eq(userSettings.userId, session.user.id));

  return RouteResponse.json({ success: true });
}
