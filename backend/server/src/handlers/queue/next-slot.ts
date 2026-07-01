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
import { format } from "date-fns";

export async function getNextQueueSlot() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return RouteResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings] = await db
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1);

  const timezone =
    settings?.timezone?.trim() && settings.timezone !== "UTC"
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
    return RouteResponse.json({ available: false, timezone });
  }

  const pendingQueued = await db
    .select({ scheduledFor: queuedPosts.scheduledFor })
    .from(queuedPosts)
    .where(
      and(
        eq(queuedPosts.userId, session.user.id),
        eq(queuedPosts.status, "pending"),
      ),
    );

  const scheduledPosts = await db
    .select({ scheduledAt: posts.scheduledAt })
    .from(posts)
    .where(
      and(
        eq(posts.userId, session.user.id),
        eq(posts.status, "scheduled"),
      ),
    );

  const occupiedSlots = [
    ...pendingQueued.map((r) => new Date(r.scheduledFor)),
    ...scheduledPosts
      .map((r) => r.scheduledAt)
      .filter((d): d is Date => d != null),
  ];

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
    return RouteResponse.json({ available: false, timezone });
  }

  const inTz = toZonedTime(next.utc, timezone);
  const displayLabel = format(inTz, "EEEE, MMM d - h:mm a");

  let timezoneLabel = timezone;
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value;
    if (tzName) timezoneLabel = `${timezone} ${tzName}`;
  } catch {
    /* keep timezone as-is */
  }

  return RouteResponse.json({
    available: true,
    slotId: next.slotId,
    scheduledFor: next.utc.toISOString(),
    displayTime: displayLabel,
    scheduledAt: next.utc.toISOString(),
    displayLabel,
    timezone,
    timezoneLabel,
  });
}
