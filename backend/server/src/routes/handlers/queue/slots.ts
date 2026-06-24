import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth.js";
import { db } from "../../../db/index.js";
import { queueSlots } from "../../../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { headers } from "next/headers";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function isValidDays(days: unknown): days is number[] {
  if (!Array.isArray(days)) return false;
  return days.every((d) => typeof d === "number" && d >= 0 && d <= 6);
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slots = await db.query.queueSlots.findMany({
    where: eq(queueSlots.userId, session.user.id),
    orderBy: [asc(queueSlots.hour), asc(queueSlots.minute)],
  });

  return NextResponse.json(slots);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { daysOfWeek?: number[]; hour?: number; minute?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const daysOfWeek = body.daysOfWeek ?? ALL_DAYS;
  const { hour, minute } = body;

  if (!isValidDays(daysOfWeek)) {
    return NextResponse.json(
      { error: "daysOfWeek must be an array of 0-6 (Sun-Sat)" },
      { status: 400 },
    );
  }
  if (
    typeof hour !== "number" ||
    hour < 0 ||
    hour > 23 ||
    typeof minute !== "number" ||
    minute < 0 ||
    minute > 59
  ) {
    return NextResponse.json(
      { error: "hour (0-23) and minute (0-59) required" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: queueSlots.id, isActive: queueSlots.isActive })
    .from(queueSlots)
    .where(
      and(
        eq(queueSlots.userId, session.user.id),
        eq(queueSlots.hour, hour),
        eq(queueSlots.minute, minute),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = existing;
    if (!row.isActive) {
      // Reactivate the soft-deleted slot and update days
      const [reactivated] = await db
        .update(queueSlots)
        .set({ isActive: true, daysOfWeek })
        .where(eq(queueSlots.id, row.id))
        .returning();
      return NextResponse.json(reactivated);
    }
    return NextResponse.json(
      { error: "A queue slot at this time already exists" },
      { status: 409 },
    );
  }

  const [slot] = await db
    .insert(queueSlots)
    .values({
      userId: session.user.id,
      daysOfWeek,
      hour,
      minute,
      isActive: true,
    })
    .returning();

  return NextResponse.json(slot);
}
