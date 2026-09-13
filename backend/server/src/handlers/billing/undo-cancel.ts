import { auth } from "../../lib/auth.js";
import { headers } from "../../lib/http/request-cookies.js";
import { RouteResponse } from "../../lib/http/http.js";
import {
  checkoutLimiter,
  enforceRateLimit,
} from "../../lib/ratelimit.js";
import DodoPayments from "dodopayments";
import { db } from "../../db/index.js";
import { userSettings } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";


const apiKey = process.env.DODO_PAYMENTS_API_KEY ?? "";
const environment =
  (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ??
  "test_mode";

export async function undoCancel() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every branch below calls the Dodo API. Without a per-user cap an
  // authenticated client can burn the payment provider's quota and take
  // billing down for everyone.
  const rate = await enforceRateLimit(checkoutLimiter, session.user.id);
  if (!rate.allowed) {
    return RouteResponse.json({ error: rate.error }, { status: rate.status });
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, session.user.id),
    columns: { subscriptionId: true, subscriptionExpiresAt: true },
  });

  if (!row?.subscriptionId) {
    return RouteResponse.json(
      { error: "No subscription found" },
      { status: 404 },
    );
  }

  if (!apiKey) {
    return RouteResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const client = new DodoPayments({ bearerToken: apiKey, environment });

  try {
    if (row.subscriptionExpiresAt && new Date() > new Date(row.subscriptionExpiresAt)) {
      return RouteResponse.json(
        { error: "Subscription already expired" },
        { status: 409 },
      );
    }
    await client.subscriptions.update(row.subscriptionId, {
      cancel_at_next_billing_date: false,
    });
    await db.execute(sql`
      UPDATE user_settings SET subscription_cancel_at_period_end = false WHERE user_id = ${session.user.id}
    `);
    return RouteResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Undo cancel failed";
    console.error("[billing/undo-cancel] Dodo error:", msg);
    return RouteResponse.json(
      { error: "Failed to undo cancellation" },
      { status: 502 },
    );
  }
}
