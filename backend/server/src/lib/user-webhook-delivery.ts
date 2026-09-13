import { createHmac, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  decryptToken,
  isSafeOutboundUrl,
  safeFetch,
  sleep,
} from "@social0/shared";
import { db } from "../db/index.js";
import { userWebhookSubscriptions, webhookDeliveries } from "../db/schema.js";

/** Events a user can subscribe to. */
export const WEBHOOK_EVENTS = [
  "post.published",
  "post.failed",
  "post.scheduled",
  "post.deleted",
] as const;

export type SubscribableWebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * On-demand ping from `POST /v1/webhooks/:id/test`. Not subscribable — it is
 * always delivered to the endpoint under test, whatever its event filter says.
 */
export const WEBHOOK_TEST_EVENT = "webhook.test";

export type WebhookEvent =
  | SubscribableWebhookEvent
  | typeof WEBHOOK_TEST_EVENT;

export type WebhookPayload = {
  id: string;
  type: WebhookEvent;
  created_at: string;
  data: Record<string, unknown>;
};

/** Terminal state of one delivery (all retries of a single event). */
export type WebhookDeliveryStatus = "delivered" | "failed" | "blocked";

export type WebhookDeliveryOutcome = {
  subscriptionId: string;
  deliveryId: string;
  event: WebhookEvent;
  url: string;
  status: WebhookDeliveryStatus;
  responseStatus: number | null;
  attempts: number;
  durationMs: number;
  error: string | null;
};

/** Per-attempt wall-clock budget, including redirect hops. */
const ATTEMPT_TIMEOUT_MS = 10_000;
/** First attempt + this many retries. */
const MAX_ATTEMPTS = 3;
/** Backoff before retry N (index 0 = before the 2nd attempt). */
const RETRY_BACKOFF_MS = [1_000, 3_000] as const;
/** Rows kept per subscription in `webhook_deliveries`. */
export const WEBHOOK_DELIVERY_LOG_LIMIT = 50;

function signWebhookPayload(
  secret: string,
  timestamp: number,
  body: string,
): string {
  // Keep in sync with @social0/shared user-webhook-signature.ts
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

/**
 * 5xx and the "come back later" 4xx are worth retrying; every other 4xx is the
 * endpoint telling us the request itself is wrong, so retrying just repeats it.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Webhook request failed";
}

type AttemptResult = {
  responseStatus: number | null;
  error: string | null;
  retryable: boolean;
};

/**
 * One POST to a customer endpoint. `safeFetch` re-validates every redirect hop,
 * so an endpoint cannot bounce us onto a private address; the AbortController
 * caps the whole hop chain rather than any single request.
 */
async function attemptDelivery(
  url: string,
  secret: string,
  payload: WebhookPayload,
  body: string,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  // Re-sign per attempt: a retry that lands after the backoff must still be
  // inside the receiver's clock-skew window.
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, timestamp, body);

  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Social0-Webhooks/1.0",
        "X-Social0-Signature": `t=${timestamp},v1=${signature}`,
        "X-Social0-Event": payload.type,
        "X-Social0-Delivery-Id": payload.id,
      },
      body,
      signal: controller.signal,
      httpsOnly: process.env.NODE_ENV === "production",
    });

    if (!res) {
      return {
        responseStatus: null,
        error:
          "Endpoint redirected to a URL that is not a public address, or the redirect chain was invalid.",
        retryable: false,
      };
    }

    // Nothing downstream reads the body; release the socket promptly.
    void res.body?.cancel().catch(() => undefined);

    if (res.status >= 200 && res.status < 300) {
      return { responseStatus: res.status, error: null, retryable: false };
    }
    return {
      responseStatus: res.status,
      error: `Endpoint returned HTTP ${res.status}.`,
      retryable: isRetryableStatus(res.status),
    };
  } catch (err) {
    const aborted = controller.signal.aborted;
    return {
      responseStatus: null,
      error: aborted
        ? `Request timed out after ${ATTEMPT_TIMEOUT_MS}ms.`
        : errorMessage(err),
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

type DeliverableSubscription = {
  id: string;
  userId: string;
  url: string;
  /** Encrypted at rest; AAD is the subscription id. */
  secret: string;
};

/**
 * Deliver one payload to one endpoint, retrying transient failures.
 * Never throws — the outcome is the return value so callers can log it.
 */
async function deliverToSubscription(
  sub: DeliverableSubscription,
  payload: WebhookPayload,
  body: string,
): Promise<WebhookDeliveryOutcome> {
  const startedAt = Date.now();
  const outcome = (
    status: WebhookDeliveryStatus,
    attempts: number,
    responseStatus: number | null,
    error: string | null,
  ): WebhookDeliveryOutcome => ({
    subscriptionId: sub.id,
    deliveryId: payload.id,
    event: payload.type,
    url: sub.url,
    status,
    attempts,
    responseStatus,
    error,
    durationMs: Date.now() - startedAt,
  });

  if (
    !isSafeOutboundUrl(sub.url, {
      httpsOnly: process.env.NODE_ENV === "production",
    })
  ) {
    return outcome(
      "blocked",
      0,
      null,
      "Webhook URL is not a public https URL. Update the endpoint to receive deliveries.",
    );
  }

  let secret: string;
  try {
    secret = decryptToken(sub.secret, sub.id);
  } catch {
    return outcome(
      "blocked",
      0,
      null,
      "Stored signing secret could not be decrypted. Recreate this webhook to get a new secret.",
    );
  }

  let last: AttemptResult = {
    responseStatus: null,
    error: "Webhook was never attempted.",
    retryable: false,
  };

  let attempt = 1;
  for (; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await attemptDelivery(sub.url, secret, payload, body);

    if (last.error === null) {
      return outcome("delivered", attempt, last.responseStatus, null);
    }
    if (!last.retryable) break;
    if (attempt === MAX_ATTEMPTS) break;
    await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? 1_000);
  }

  return outcome(
    "failed",
    Math.min(attempt, MAX_ATTEMPTS),
    last.responseStatus,
    last.error,
  );
}

/**
 * Persist the outcome so `GET /v1/webhooks/:id/deliveries` can answer
 * "did you even try?". Best-effort: a logging failure must never fail a
 * publish, and the columns are additive so an un-migrated database degrades
 * to today's behavior instead of breaking delivery.
 */
async function recordDelivery(
  userId: string,
  outcome: WebhookDeliveryOutcome,
): Promise<void> {
  try {
    await db.insert(webhookDeliveries).values({
      subscriptionId: outcome.subscriptionId,
      userId,
      deliveryId: outcome.deliveryId,
      event: outcome.event,
      url: outcome.url,
      status: outcome.status,
      responseStatus: outcome.responseStatus,
      attempts: outcome.attempts,
      durationMs: outcome.durationMs,
      error: outcome.error,
    });

    await db
      .update(userWebhookSubscriptions)
      .set({
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: outcome.status,
        lastDeliveryResponseStatus: outcome.responseStatus,
        lastDeliveryError: outcome.error,
      })
      .where(eq(userWebhookSubscriptions.id, outcome.subscriptionId));

    await db.execute(sql`
      DELETE FROM webhook_deliveries
      WHERE subscription_id = ${outcome.subscriptionId}
        AND id NOT IN (
          SELECT id FROM webhook_deliveries
          WHERE subscription_id = ${outcome.subscriptionId}
          ORDER BY created_at DESC
          LIMIT ${WEBHOOK_DELIVERY_LOG_LIMIT}
        )
    `);
  } catch (err) {
    console.warn("[webhook] could not record delivery:", errorMessage(err));
  }
}

/**
 * Whether any active subscription would receive this event. Lets publish
 * finalize skip its one-shot claim (and the post-metadata write it costs) for
 * the majority of users, who have no webhooks at all.
 */
export async function hasWebhookSubscriberFor(
  userId: string,
  type: WebhookEvent,
): Promise<boolean> {
  const subs = await db
    .select({ events: userWebhookSubscriptions.events })
    .from(userWebhookSubscriptions)
    .where(
      and(
        eq(userWebhookSubscriptions.userId, userId),
        eq(userWebhookSubscriptions.active, true),
      ),
    );
  return subs.some((s) => s.events.includes(type));
}

function buildPayload(
  type: WebhookEvent,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    id: randomUUID(),
    type,
    created_at: new Date().toISOString(),
    data,
  };
}

/**
 * Deliver an event to every matching subscription and wait for the result.
 *
 * Publish paths MUST use this rather than `emitUserWebhookEvent`: the
 * Cloudflare publish worker tears its isolate down as soon as the queue
 * handler resolves, and any promise still in flight is cancelled before the
 * request leaves the edge.
 */
export async function deliverUserWebhookEvent(
  userId: string,
  type: WebhookEvent,
  data: Record<string, unknown>,
): Promise<WebhookDeliveryOutcome[]> {
  const subs = await db
    .select({
      id: userWebhookSubscriptions.id,
      userId: userWebhookSubscriptions.userId,
      url: userWebhookSubscriptions.url,
      secret: userWebhookSubscriptions.secret,
      events: userWebhookSubscriptions.events,
    })
    .from(userWebhookSubscriptions)
    .where(
      and(
        eq(userWebhookSubscriptions.userId, userId),
        eq(userWebhookSubscriptions.active, true),
      ),
    );

  const matching = subs.filter((s) => s.events.includes(type));
  if (matching.length === 0) return [];

  const payload = buildPayload(type, data);
  const body = JSON.stringify(payload);

  const settled = await Promise.allSettled(
    matching.map(async (sub) => {
      const outcome = await deliverToSubscription(sub, payload, body);
      await recordDelivery(userId, outcome);
      if (outcome.status !== "delivered") {
        console.warn(
          `[webhook] ${type} to ${sub.id} ${outcome.status} after ${outcome.attempts} attempt(s):`,
          outcome.error,
        );
      }
      return outcome;
    }),
  );

  return settled.flatMap((r) => {
    if (r.status === "fulfilled") return [r.value];
    console.warn("[webhook] delivery error:", errorMessage(r.reason));
    return [];
  });
}

/**
 * Fire-and-forget delivery for Fastify HTTP handlers on the API server, where
 * the process outlives the response and the handler must return fast.
 *
 * Do NOT call this from Cloudflare Workers code (publish worker, cron worker):
 * the isolate is torn down when the handler resolves and the delivery is
 * silently dropped. Use `deliverUserWebhookEvent` there.
 */
export function emitUserWebhookEvent(
  userId: string,
  type: WebhookEvent,
  data: Record<string, unknown>,
): void {
  void deliverUserWebhookEvent(userId, type, data).catch((err) => {
    console.warn("[webhook] delivery error:", errorMessage(err));
  });
}

/**
 * On-demand signed ping to a single endpoint, bypassing the event filter.
 * Backs the webhook test endpoints so a developer can see a response code
 * without waiting for a real publish.
 */
export async function sendWebhookTestDelivery(
  sub: DeliverableSubscription,
): Promise<WebhookDeliveryOutcome> {
  const payload = buildPayload(WEBHOOK_TEST_EVENT, {
    message: "Test delivery from Social0.",
    subscription_id: sub.id,
  });
  const outcome = await deliverToSubscription(
    sub,
    payload,
    JSON.stringify(payload),
  );
  await recordDelivery(sub.userId, outcome);
  return outcome;
}
