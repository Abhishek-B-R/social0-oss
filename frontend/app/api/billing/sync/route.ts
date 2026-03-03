import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";
import { getTierFromPolarProductId, PLAN_IDS } from "@/lib/plans";
import { setSubscriptionFromPolar } from "@/lib/subscription";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
});

/**
 * Sync current user's subscription from Polar by email.
 * Lists active subscriptions for our products and matches customer email.
 * Updates DB so the app shows the correct plan (e.g. after payment when webhook didn't run).
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.POLAR_ACCESS_TOKEN;
  const productIds = [PLAN_IDS.starter, PLAN_IDS.growth].filter(Boolean);
  if (!token || productIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Billing sync not configured" },
      { status: 503 },
    );
  }

  const userEmail = (session.user.email ?? "").trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json(
      { ok: false, error: "No email on account" },
      { status: 400 },
    );
  }

  try {
    // 1) List subscriptions for our products and match by customer email
    for (const productId of productIds) {
      const list = await polar.subscriptions.list({
        productId,
        active: true,
        limit: 100,
      });

      for await (const page of list) {
        const items = page.result?.items ?? [];
        for (const sub of items) {
          const customerEmail = (sub.customer?.email ?? "").trim().toLowerCase();
          if (customerEmail !== userEmail) continue;

          const tier = getTierFromPolarProductId(sub.productId);
          if (tier === "free") continue;

          await setSubscriptionFromPolar(session.user.id, {
            tier,
            expiresAt: sub.currentPeriodEnd,
            polarSubscriptionId: sub.id,
            polarCustomerId: sub.customerId,
          });

          return NextResponse.json({ ok: true, tier });
        }
      }
    }

    // 2) Fallback: find customer by email, then list their active subscriptions
    const customersList = await polar.customers.list({
      email: userEmail,
      limit: 5,
    });
    for await (const page of customersList) {
      const customers = page.result?.items ?? [];
      for (const customer of customers) {
        const subList = await polar.subscriptions.list({
          customerId: customer.id,
          active: true,
          limit: 10,
        });
        for await (const subPage of subList) {
          const items = subPage.result?.items ?? [];
          for (const sub of items) {
            const tier = getTierFromPolarProductId(sub.productId);
            if (tier === "free") continue;

            await setSubscriptionFromPolar(session.user.id, {
              tier,
              expiresAt: sub.currentPeriodEnd,
              polarSubscriptionId: sub.id,
              polarCustomerId: sub.customerId,
            });

            return NextResponse.json({ ok: true, tier });
          }
        }
      }
    }

    return NextResponse.json({ ok: false });
  } catch (e) {
    console.error("[billing/sync] Polar sync error:", e);
    return NextResponse.json(
      { ok: false, error: "Sync failed" },
      { status: 500 },
    );
  }
}
