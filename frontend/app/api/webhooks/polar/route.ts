import { Webhooks } from "@polar-sh/nextjs";
import { db } from "@/db";
import { user, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setSubscriptionFromPolar } from "@/lib/subscription";
import { getTierFromPolarProductId, PLAN_IDS } from "@/lib/plans";

const webhookSecret =
  process.env.POLAR_WEBHOOK_SECRET ?? process.env.POLAR_WEBHOOK_SECRET_PROD ?? "";

async function handleSubscriptionActive(payload: {
  data: {
    productId: string;
    customerId: string;
    currentPeriodEnd: Date | null;
    customer: { email: string };
    id: string;
    metadata?: Record<string, unknown>;
  };
}) {
  const data = payload.data;
  const tier = getTierFromPolarProductId(data.productId);

  if (tier === "free") {
    console.warn(
      "[polar webhook] Subscription product ID did not match env:",
      {
        receivedProductId: data.productId,
        expectedStarterId: PLAN_IDS.starter || "(not set)",
        expectedGrowthId: PLAN_IDS.growth || "(not set)",
        customerEmail: data.customer?.email,
      },
    );
    return;
  }

  let userId: string | null = null;
  const metadataUserId =
    data.metadata && typeof data.metadata.userId === "string"
      ? data.metadata.userId
      : null;
  if (metadataUserId) {
    const byId = await db.query.user.findFirst({
      where: eq(user.id, metadataUserId),
      columns: { id: true },
    });
    if (byId) userId = byId.id;
  }
  if (!userId && data.customer?.email) {
    const byEmail = await db.query.user.findFirst({
      where: eq(user.email, data.customer.email),
      columns: { id: true },
    });
    if (byEmail) userId = byEmail.id;
  }
  if (!userId) {
    console.warn("[polar webhook] No user found for subscription:", {
      customerEmail: data.customer?.email,
      metadataUserId: metadataUserId ?? null,
    });
    return;
  }

  await setSubscriptionFromPolar(userId, {
    tier,
    expiresAt: data.currentPeriodEnd,
    polarSubscriptionId: data.id,
    polarCustomerId: data.customerId,
  });
  console.log("[polar webhook] Subscription updated:", { userId, tier, subscriptionId: data.id });
}

async function handleSubscriptionRevoked(payload: {
  data: { id: string; customerId: string; customer: { email: string } };
}) {
  const data = payload.data;
  let userId: string | null = null;

  if (data.id) {
    const bySubId = await db.query.userSettings.findFirst({
      where: eq(userSettings.polarSubscriptionId, data.id),
      columns: { userId: true },
    });
    if (bySubId) userId = bySubId.userId;
  }
  if (!userId && data.customer?.email) {
    const byEmail = await db.query.user.findFirst({
      where: eq(user.email, data.customer.email),
      columns: { id: true },
    });
    if (byEmail) userId = byEmail.id;
  }
  if (!userId) return;

  await setSubscriptionFromPolar(userId, {
    tier: "free",
    expiresAt: null,
    polarSubscriptionId: null,
    polarCustomerId: null,
  });
}

export const POST = Webhooks({
  webhookSecret,
  onSubscriptionCreated: async (payload) => {
    const data = payload.data as {
      productId: string;
      customerId: string;
      currentPeriodEnd: Date | null;
      customer: { email: string };
      id: string;
      metadata?: Record<string, unknown>;
    };
    await handleSubscriptionActive({ data });
  },
  onSubscriptionActive: async (payload) => {
    const data = payload.data as {
      productId: string;
      customerId: string;
      currentPeriodEnd: Date | null;
      customer: { email: string };
      id: string;
      metadata?: Record<string, unknown>;
    };
    await handleSubscriptionActive({ data });
  },
  onSubscriptionUpdated: async (payload) => {
    const data = payload.data as {
      productId: string;
      customerId: string;
      currentPeriodEnd: Date | null;
      customer: { email: string };
      id: string;
      metadata?: Record<string, unknown>;
    };
    await handleSubscriptionActive({ data });
  },
  onSubscriptionRevoked: async (payload) => {
    const data = payload.data as { id: string; customerId: string; customer: { email: string } };
    await handleSubscriptionRevoked({ data });
  },
});
