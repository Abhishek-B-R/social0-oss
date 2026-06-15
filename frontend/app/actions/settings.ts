"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userSettings, connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DateFormatKey } from "@/lib/date-format";

export type SettingsSnapshot = {
  automationEmails: boolean;
  emailOnPostFailed: boolean;
  use24HourTimeFormat: boolean;
  dateFormat: DateFormatKey;
  timezone: string;
};

const DEFAULT_SETTINGS: SettingsSnapshot = {
  automationEmails: true,
  emailOnPostFailed: true,
  use24HourTimeFormat: false,
  dateFormat: "dd/MM/yyyy",
  timezone: "UTC",
};

/** Valid IANA timezone from client (e.g. from Intl); max length for safety. */
function sanitizeClientTimezone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const tz = value.trim();
  return tz.length <= 60 ? tz : null;
}

async function getCurrentUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function getUserSettingsSnapshot(): Promise<SettingsSnapshot> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return DEFAULT_SETTINGS;
  }

  const row = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: {
      automationEmails: true,
      emailOnPostFailed: true,
      use24HourTimeFormat: true,
      dateFormat: true,
      timezone: true,
    },
  });

  if (!row) {
    return DEFAULT_SETTINGS;
  }

  const dateFormat = row.dateFormat as DateFormatKey | null | undefined;
  const validDateFormat =
    dateFormat === "dd/MM/yyyy" ||
    dateFormat === "MM/dd/yyyy" ||
    dateFormat === "yyyy-MM-dd"
      ? dateFormat
      : DEFAULT_SETTINGS.dateFormat;

  const timezone =
    typeof row.timezone === "string" && row.timezone.trim().length > 0
      ? row.timezone.trim()
      : DEFAULT_SETTINGS.timezone;

  return {
    automationEmails: row.automationEmails ?? DEFAULT_SETTINGS.automationEmails,
    emailOnPostFailed:
      row.emailOnPostFailed ?? DEFAULT_SETTINGS.emailOnPostFailed,
    use24HourTimeFormat:
      row.use24HourTimeFormat ?? DEFAULT_SETTINGS.use24HourTimeFormat,
    dateFormat: validDateFormat,
    timezone,
  };
}

async function upsertSettings(
  values: Partial<SettingsSnapshot>,
  clientTimezone?: string | null,
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/");
  }

  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
    columns: { userId: true },
  });

  const defaultTz =
    values.timezone ??
    sanitizeClientTimezone(clientTimezone) ??
    DEFAULT_SETTINGS.timezone;

  if (existing) {
    await db
      .update(userSettings)
      .set(values)
      .where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({
      userId,
      timezone: defaultTz,
      automationEmails: DEFAULT_SETTINGS.automationEmails,
      emailOnPostFailed: DEFAULT_SETTINGS.emailOnPostFailed,
      use24HourTimeFormat: DEFAULT_SETTINGS.use24HourTimeFormat,
      dateFormat: DEFAULT_SETTINGS.dateFormat,
      ...values,
    });
  }

  revalidatePath("/dashboard/settings");
}

export async function updateDisplayName(formData: FormData): Promise<void> {
  const sessionHeaders = await headers();
  const session = await auth.api.getSession({ headers: sessionHeaders });
  if (!session) {
    redirect("/");
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    return;
  }

  await auth.api.updateUser({
    headers: sessionHeaders,
    body: { name: displayName },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout");
}

export async function updateUserImage(imageUrl: string): Promise<{ error?: string }> {
  const sessionHeaders = await headers();
  const session = await auth.api.getSession({ headers: sessionHeaders });
  if (!session) {
    return { error: "Unauthorized" };
  }
  const url = String(imageUrl ?? "").trim();
  if (!url) {
    return { error: "Image URL is required" };
  }
  try {
    await auth.api.updateUser({
      headers: sessionHeaders,
      body: { image: url },
    });
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard", "layout");
    return {};
  } catch {
    return { error: "Failed to update avatar" };
  }
}

export async function updateConnectionAvatar(
  connectedAccountId: string,
  profileImageUrl: string,
): Promise<{ error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { error: "Unauthorized" };
  }
  const url = String(profileImageUrl ?? "").trim();
  if (!url) {
    return { error: "Image URL is required" };
  }
  try {
    const [updated] = await db
      .update(connectedAccounts)
      .set({
        profileImageUrl: url,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(connectedAccounts.id, connectedAccountId),
          eq(connectedAccounts.userId, userId),
        ),
      )
      .returning({ id: connectedAccounts.id });
    if (!updated) {
      return { error: "Connection not found or access denied" };
    }
    revalidatePath("/dashboard/settings");
    return {};
  } catch {
    return { error: "Failed to update avatar" };
  }
}

export async function updateAutomationEmails(formData: FormData): Promise<void> {
  const clientTimezone = formData.get("clientTimezone");
  await upsertSettings(
    {
      automationEmails: formData.get("automationEmails") === "on",
      emailOnPostFailed: formData.get("emailOnPostFailed") === "on",
    },
    typeof clientTimezone === "string" ? clientTimezone : undefined,
  );
}

export async function updatePlatformPreferences(formData: FormData): Promise<void> {
  const dateFormatRaw = formData.get("dateFormat");
  const dateFormat =
    dateFormatRaw === "dd/MM/yyyy" ||
    dateFormatRaw === "MM/dd/yyyy" ||
    dateFormatRaw === "yyyy-MM-dd"
      ? dateFormatRaw
      : undefined;
  const clientTimezone = formData.get("clientTimezone");
  await upsertSettings(
    {
      use24HourTimeFormat: formData.get("use24HourTimeFormat") === "on",
      ...(dateFormat !== undefined && { dateFormat }),
    },
    typeof clientTimezone === "string" ? clientTimezone : undefined,
  );
}

export async function updateTimezone(formData: FormData): Promise<void> {
  const tz = formData.get("timezone");
  const timezone =
    typeof tz === "string" && tz.trim().length > 0 ? tz.trim() : "UTC";
  const clientTimezone = formData.get("clientTimezone");
  await upsertSettings(
    { timezone },
    typeof clientTimezone === "string" ? clientTimezone : undefined,
  );
}

export async function signOutAllDevices(): Promise<void> {
  const sessionHeaders = await headers();
  const session = await auth.api.getSession({ headers: sessionHeaders });
  if (!session) {
    redirect("/");
  }

  await auth.api.revokeSessions({
    headers: sessionHeaders,
  });

  redirect("/");
}
