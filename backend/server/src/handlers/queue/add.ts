import { RouteResponse } from "../../lib/http/http.js";
import { auth } from "../../lib/auth.js";
import { db } from "../../db/index.js";
import {
  userSettings,
  queueSlots,
  queuedPosts,
  posts,
} from "../../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { headers } from "../../lib/http/request-cookies.js";
import { getNextAvailableSlot } from "../../lib/queue-utils.js";
import { toZonedTime } from "date-fns-tz";
import { requireWorkspacePermissionForUser } from "../../lib/workspace/session.js";
import { postScopeCondition } from "../../lib/workspace/context.js";

export async function addToQueue(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ws = await requireWorkspacePermissionForUser(
    session.user.id,
    "create_posts",
  );
  if (!ws.ok) {
    return RouteResponse.json({ error: ws.error }, { status: ws.statusCode });
  }
  const userId = ws.ctx.resourceUserId;

  let body: { postId?: string };
  try {
    body = await request.json();
  } catch {
    return RouteResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { postId } = body;
  if (!postId || typeof postId !== "string") {
    return RouteResponse.json({ error: "postId required" }, { status: 400 });
  }

  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)))
    .limit(1);

  if (!post) {
    return RouteResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const [settings] = await db
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const timezone = settings?.timezone?.trim() && settings.timezone !== "UTC"
    ? settings.timezone
    : "UTC";

  const slots = await db.query.queueSlots.findMany({
    where: and(
      eq(queueSlots.userId, userId),
      eq(queueSlots.isActive, true),
    ),
    orderBy: [asc(queueSlots.hour), asc(queueSlots.minute)],
  });

  if (slots.length === 0) {
    return RouteResponse.json(
      { error: "No queue slots configured. Add slots in Settings → Queue." },
      { status: 400 },
    );
  }

  const pending = await db
    .select({ scheduledFor: queuedPosts.scheduledFor })
    .from(queuedPosts)
    .innerJoin(posts, eq(queuedPosts.postId, posts.id))
    .where(
      and(
        eq(queuedPosts.userId, userId),
        eq(queuedPosts.status, "pending"),
        postScopeCondition(ws.ctx),
      ),
    );

  const occupiedSlots = pending.map((r) => new Date(r.scheduledFor));
  const slotRows = slots.map((s) => ({
    id: s.id,
    userId: s.userId,
    daysOfWeek: s.daysOfWeek ?? [],
    hour: s.hour,
    minute: s.minute,
    isActive: s.isActive,
  }));

  const next = getNextAvailableSlot(
    slotRows,
    occupiedSlots,
    timezone,
    new Date(),
  );

  if (!next) {
    return RouteResponse.json(
      { error: "Could not find an available slot" },
      { status: 400 },
    );
  }

  const [queued] = await db
    .insert(queuedPosts)
    .values({
      userId,
      postId,
      slotId: next.slotId,
      scheduledFor: next.utc,
      status: "pending",
    })
    .returning();

  await db
    .update(posts)
    .set({ status: "scheduled", scheduledAt: next.utc, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), postScopeCondition(ws.ctx)));

  const displayInTz = toZonedTime(next.utc, timezone);
  const scheduledForUser = {
    iso: next.utc.toISOString(),
    local: displayInTz.toISOString().slice(0, 16),
    dayName: displayInTz.toLocaleDateString("en-US", { weekday: "long" }),
    time: displayInTz.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  };

  return RouteResponse.json({
    queuedPostId: queued.id,
    scheduledFor: next.utc.toISOString(),
    scheduledForUser,
  });
}
