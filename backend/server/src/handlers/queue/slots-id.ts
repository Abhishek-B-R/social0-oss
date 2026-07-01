import { RouteResponse } from "../../lib/http/http.js";
import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { queueSlots } from "../../db/schema.js";
import { eq, and, ne } from "drizzle-orm";
import { headers } from "../../lib/http/request-cookies.js";

function isValidDays(days: unknown): days is number[] {
  if (!Array.isArray(days)) return false;
  return days.every((d) => typeof d === "number" && d >= 0 && d <= 6);
}

export async function updateQueueSlot(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return RouteResponse.json({ error: "Slot id required" }, { status: 400 });
  }

  let body: { daysOfWeek?: number[]; hour?: number; minute?: number };
  try {
    body = await request.json();
  } catch {
    return RouteResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: { daysOfWeek?: number[]; hour?: number; minute?: number } = {};
  if (body.daysOfWeek !== undefined) {
    if (!isValidDays(body.daysOfWeek)) {
      return RouteResponse.json(
        { error: "daysOfWeek must be an array of 0-6 (Sun-Sat)" },
        { status: 400 },
      );
    }
    updates.daysOfWeek = body.daysOfWeek;
  }
  if (typeof body.hour === "number" && body.hour >= 0 && body.hour <= 23) {
    updates.hour = body.hour;
  }
  if (typeof body.minute === "number" && body.minute >= 0 && body.minute <= 59) {
    updates.minute = body.minute;
  }

  if (Object.keys(updates).length === 0) {
    return RouteResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  if (updates.hour !== undefined || updates.minute !== undefined) {
    const [current] = await db
      .select({ hour: queueSlots.hour, minute: queueSlots.minute })
      .from(queueSlots)
      .where(and(eq(queueSlots.id, id), eq(queueSlots.userId, session.user.id)))
      .limit(1);
    if (!current) {
      return RouteResponse.json({ error: "Slot not found" }, { status: 404 });
    }
    const effHour = updates.hour ?? current.hour;
    const effMinute = updates.minute ?? current.minute;
    const duplicate = await db
      .select({ id: queueSlots.id })
      .from(queueSlots)
      .where(
        and(
          eq(queueSlots.userId, session.user.id),
          eq(queueSlots.hour, effHour),
          eq(queueSlots.minute, effMinute),
          ne(queueSlots.id, id),
        ),
      )
      .limit(1);
    if (duplicate.length > 0) {
      return RouteResponse.json(
        { error: "A queue slot at this time already exists" },
        { status: 409 },
      );
    }
  }

  const [updated] = await db
    .update(queueSlots)
    .set(updates)
    .where(and(eq(queueSlots.id, id), eq(queueSlots.userId, session.user.id)))
    .returning();

  if (!updated) {
    return RouteResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  return RouteResponse.json(updated);
}

export async function deleteQueueSlot(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return RouteResponse.json({ error: "Slot id required" }, { status: 400 });
  }

  const [updated] = await db
    .update(queueSlots)
    .set({ isActive: false })
    .where(and(eq(queueSlots.id, id), eq(queueSlots.userId, session.user.id)))
    .returning();

  if (!updated) {
    return RouteResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  return RouteResponse.json(updated);
}
