import { db } from "../db/index.js";
import { securityEvents } from "../db/schema.js";

export async function logSecurityEvent(input: {
  userId?: string | null;
  eventType: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(securityEvents).values({
      userId: input.userId ?? null,
      eventType: input.eventType,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.error("[security] failed to log event", input.eventType, err);
  }
}
