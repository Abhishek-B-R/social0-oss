import { db } from "@/db";
import { queueSlots } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** Returns true when the slot exists and belongs to the user. */
export async function userOwnsQueueSlot(
  userId: string,
  slotId: string,
): Promise<boolean> {
  const [slot] = await db
    .select({ id: queueSlots.id })
    .from(queueSlots)
    .where(and(eq(queueSlots.id, slotId), eq(queueSlots.userId, userId)))
    .limit(1);
  return !!slot;
}
