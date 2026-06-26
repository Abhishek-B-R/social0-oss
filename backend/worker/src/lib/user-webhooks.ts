import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { isSafeOutboundUrl } from "@social0/shared";
import { db } from "../db/index.js";
import { userWebhookSubscriptions } from "../db/schema.js";

type WebhookSub = typeof userWebhookSubscriptions.$inferSelect;

export async function dispatchUserWebhooks(input: {
  userId: string;
  event: string;
  payload: Record<string, unknown>;
}) {
  const subs = await db
    .select()
    .from(userWebhookSubscriptions)
    .where(
      and(
        eq(userWebhookSubscriptions.userId, input.userId),
        eq(userWebhookSubscriptions.active, true),
      ),
    );

  const httpsOnly = process.env.NODE_ENV === "production";
  const matching = subs.filter(
    (s: WebhookSub) =>
      s.events.includes(input.event) &&
      isSafeOutboundUrl(s.url, { httpsOnly }),
  );
  if (matching.length === 0) return;

  const body = JSON.stringify({
    event: input.event,
    data: input.payload,
    ts: new Date().toISOString(),
  });

  await Promise.allSettled(
    matching.map(async (sub: WebhookSub) => {
      const sig = createHmac("sha256", sub.secret).update(body).digest("hex");
      const res = await fetch(sub.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-social0-signature": sig,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.warn(
          `[user-webhook] delivery failed user=${input.userId} status=${res.status}`,
        );
      }
    }),
  );
}
