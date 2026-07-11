import { fromZonedTime } from "date-fns-tz";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { userSettings } from "../db/schema.js";
import { isoDateTimeSchema } from "./validation.js";

const DEFAULT_SUFFIX = /\+default$/i;
const NAIVE_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{3}))?$/;

export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getUserTimezone(userId: string): Promise<string> {
  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { timezone: true },
  });
  const tz = row?.timezone?.trim();
  return tz && isValidIanaTimezone(tz) ? tz : "UTC";
}

function wallTimeToUtc(
  naive: string,
  timeZone: string,
): { ok: true; utc: Date } | { ok: false; error: string } {
  const m = naive.match(NAIVE_ISO);
  if (!m) {
    return {
      ok: false,
      error:
        "scheduledAt must be ISO 8601 (e.g. 2026-07-20T10:00:00) when using timezone or +default",
    };
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? "0");
  const ms = Number((m[7] ?? "0").padEnd(3, "0"));

  const wall = new Date(year, month - 1, day, hour, minute, second, ms);
  if (Number.isNaN(wall.getTime())) {
    return { ok: false, error: "scheduledAt is not a valid datetime" };
  }

  return { ok: true, utc: fromZonedTime(wall, timeZone) };
}

async function resolveZone(
  userId: string,
  timezone: string | undefined,
): Promise<{ ok: true; tz: string } | { ok: false; error: string }> {
  if (!timezone || timezone === "default") {
    return { ok: true, tz: await getUserTimezone(userId) };
  }
  if (!isValidIanaTimezone(timezone)) {
    return { ok: false, error: `Invalid timezone: ${timezone}` };
  }
  return { ok: true, tz: timezone };
}

/**
 * Resolve API scheduledAt to a UTC instant.
 * - `…Z` or `…+05:30` → absolute instant
 * - `…+default` → wall time in user's dashboard timezone (user_settings.timezone)
 * - naive `…T10:00:00` + `timezone: "default"` | IANA → wall time in that zone
 */
export async function resolveScheduledAt(
  userId: string,
  scheduledAt: string,
  timezone?: string,
): Promise<{ ok: true; utc: Date } | { ok: false; error: string }> {
  const trimmed = scheduledAt.trim();

  if (DEFAULT_SUFFIX.test(trimmed)) {
    const naive = trimmed.replace(DEFAULT_SUFFIX, "");
    const zone = await resolveZone(userId, "default");
    if (!zone.ok) return zone;
    return wallTimeToUtc(naive, zone.tz);
  }

  if (isoDateTimeSchema.safeParse(trimmed).success) {
    const utc = new Date(trimmed);
    if (Number.isNaN(utc.getTime())) {
      return { ok: false, error: "scheduledAt is not a valid datetime" };
    }
    return { ok: true, utc };
  }

  if (timezone !== undefined || NAIVE_ISO.test(trimmed)) {
    const zone = await resolveZone(userId, timezone ?? "default");
    if (!zone.ok) return zone;
    return wallTimeToUtc(trimmed, zone.tz);
  }

  return {
    ok: false,
    error:
      'scheduledAt must be UTC (…Z), include an offset (+05:30), end with +default (e.g. 2026-07-20T10:00:00+default), or be a naive datetime with timezone: "default"',
  };
}
