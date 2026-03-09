import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  userSettings,
  queueSlots,
  queuedPosts,
  posts,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { headers } from "next/headers";
import { getNextAvailableSlot } from "@/lib/queue-utils";
import { toZonedTime } from "date-fns-tz";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { postId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { postId } = body;
  if (!postId || typeof postId !== "string") {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }

  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, session.user.id)))
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const [settings] = await db
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  const timezone = settings?.timezone?.trim() && settings.timezone !== "UTC"
    ? settings.timezone
    : "UTC";

  const slots = await db.query.queueSlots.findMany({
    where: and(
      eq(queueSlots.userId, session.user.id),
      eq(queueSlots.isActive, true),
    ),
    orderBy: [asc(queueSlots.hour), asc(queueSlots.minute)],
  });

  if (slots.length === 0) {
    return NextResponse.json(
      { error: "No queue slots configured. Add slots in Settings → Queue." },
      { status: 400 },
    );
  }

  const pending = await db
    .select({ scheduledFor: queuedPosts.scheduledFor })
    .from(queuedPosts)
    .where(
      and(
        eq(queuedPosts.userId, session.user.id),
        eq(queuedPosts.status, "pending"),
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
    return NextResponse.json(
      { error: "Could not find an available slot" },
      { status: 400 },
    );
  }

  const [queued] = await db
    .insert(queuedPosts)
    .values({
      userId: session.user.id,
      postId,
      slotId: next.slotId,
      scheduledFor: next.utc,
      status: "pending",
    })
    .returning();

  await db
    .update(posts)
    .set({ status: "scheduled", scheduledAt: next.utc, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), eq(posts.userId, session.user.id)));

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

  return NextResponse.json({
    queuedPostId: queued.id,
    scheduledFor: next.utc.toISOString(),
    scheduledForUser,
  });
}
