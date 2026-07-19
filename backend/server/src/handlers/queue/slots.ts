import { RouteResponse } from "../../lib/http/http.js";
import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import { queueSlots } from "../../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { headers } from "../../lib/http/request-cookies.js";
import { requireWorkspacePermissionForUser } from "../../lib/workspace/session.js";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function isValidDays(days: unknown): days is number[] {
  if (!Array.isArray(days)) return false;
  return days.every((d) => typeof d === "number" && d >= 0 && d <= 6);
}

export async function listQueueSlots() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ws = await requireWorkspacePermissionForUser(
    session.user.id,
    "view_posts",
  );
  if (!ws.ok) {
    return RouteResponse.json({ error: ws.error }, { status: ws.statusCode });
  }

  const slots = await db.query.queueSlots.findMany({
    where: eq(queueSlots.userId, ws.ctx.resourceUserId),
    orderBy: [asc(queueSlots.hour), asc(queueSlots.minute)],
  });

  return RouteResponse.json(slots);
}

export async function createQueueSlot(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ws = await requireWorkspacePermissionForUser(
    session.user.id,
    "manage_workspace_settings",
  );
  if (!ws.ok) {
    return RouteResponse.json({ error: ws.error }, { status: ws.statusCode });
  }

  let body: { daysOfWeek?: number[]; hour?: number; minute?: number };
  try {
    body = await request.json();
  } catch {
    return RouteResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const daysOfWeek = body.daysOfWeek ?? ALL_DAYS;
  const { hour, minute } = body;

  if (!isValidDays(daysOfWeek)) {
    return RouteResponse.json(
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
    return RouteResponse.json(
      { error: "hour (0-23) and minute (0-59) required" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: queueSlots.id, isActive: queueSlots.isActive })
    .from(queueSlots)
    .where(
      and(
        eq(queueSlots.userId, ws.ctx.resourceUserId),
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
      return RouteResponse.json(reactivated);
    }
    return RouteResponse.json(
      { error: "A queue slot at this time already exists" },
      { status: 409 },
    );
  }

  const [slot] = await db
    .insert(queueSlots)
    .values({
      userId: ws.ctx.resourceUserId,
      daysOfWeek,
      hour,
      minute,
      isActive: true,
    })
    .returning();

  return RouteResponse.json(slot);
}
