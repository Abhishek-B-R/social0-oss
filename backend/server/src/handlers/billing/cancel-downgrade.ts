import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import DodoPayments from "dodopayments";
import { db } from "../../db/index.js";
import { userSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../../lib/env.js";
import { listOpenDodoSubscriptions } from "../../lib/billing-guards.js";
import { forceCancelDodoSubscription } from "../../lib/billing-zombie-utils.js";

const apiKey = env.DODO_PAYMENTS_API_KEY ?? "";
const environment = env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";

/**
 * Cancel a scheduled or stuck plan change and remove duplicate/unpaid Dodo
 * subscriptions (e.g. an on_hold Pro sub left after a failed Growth → Pro upgrade).
 * Does not require pendingPlanTier in DB — call whenever upgrade recovery is needed.
 */
export async function cancelDowngrade() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userEmail = session.user.email?.trim() ?? "";

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: {
      pendingPlanTier: true,
      subscriptionId: true,
      customerId: true,
    },
  });

  if (!row?.subscriptionId) {
    return RouteResponse.json(
      { error: "No active subscription found" },
      { status: 404 },
    );
  }

  const canonicalSubId = row.subscriptionId;
  let cancelledPendingChange = false;
  let cancelledRivals = 0;

  if (apiKey) {
    const client = new DodoPayments({ bearerToken: apiKey, environment });
    try {
      await client.subscriptions.cancelChangePlan(canonicalSubId);
      cancelledPendingChange = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("404") && !msg.toLowerCase().includes("not found")) {
        console.warn("[billing/cancel-downgrade] cancelChangePlan:", msg);
      }
    }

    if (userEmail) {
      const openSubs = await listOpenDodoSubscriptions(
        userEmail,
        row.customerId,
      );
      for (const sub of openSubs) {
        if (sub.subscriptionId === canonicalSubId) continue;
        const result = await forceCancelDodoSubscription(sub.subscriptionId);
        if (result.ok) cancelledRivals += 1;
      }
    }
  }

  await db
    .update(userSettings)
    .set({ pendingPlanTier: null, downgradeReason: null })
    .where(eq(userSettings.userId, session.user.id));

  return RouteResponse.json({
    success: true,
    cancelledPendingChange,
    cancelledRivals,
  });
}
