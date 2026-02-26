"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type SettingsSnapshot = {
  automationEmails: boolean;
  use24HourTimeFormat: boolean;
};

const DEFAULT_SETTINGS: SettingsSnapshot = {
  automationEmails: true,
  use24HourTimeFormat: false,
};

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
      use24HourTimeFormat: true,
    },
  });

  if (!row) {
    return DEFAULT_SETTINGS;
  }

  return {
    automationEmails: row.automationEmails ?? DEFAULT_SETTINGS.automationEmails,
    use24HourTimeFormat:
      row.use24HourTimeFormat ?? DEFAULT_SETTINGS.use24HourTimeFormat,
  };
}

async function upsertSettings(values: Partial<SettingsSnapshot>): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/");
  }

  await db
    .insert(userSettings)
    .values({
      userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: values,
    });

  revalidatePath("/dashboard/settings");
}

export async function updateDisplayName(formData: FormData): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/");
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    return;
  }

  await db
    .update(user)
    .set({
      name: displayName,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));

  revalidatePath("/dashboard/settings");
}

export async function updateAutomationEmails(formData: FormData): Promise<void> {
  await upsertSettings({
    automationEmails: formData.get("automationEmails") === "on",
  });
}

export async function updatePlatformPreferences(formData: FormData): Promise<void> {
  await upsertSettings({
    use24HourTimeFormat: formData.get("use24HourTimeFormat") === "on",
  });
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
