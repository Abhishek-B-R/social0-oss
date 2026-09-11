import { rpc } from "@/lib/rpc";
import type { DateFormatKey } from "@/lib/date-format";

export type SettingsSnapshot = {
  automationEmails: boolean;
  emailOnPostFailed: boolean;
  use24HourTimeFormat: boolean;
  dateFormat: DateFormatKey;
  timezone: string;
};

export async function loadSettingsPageData(): Promise<{
  displayName: string;
  email: string;
  image: string | null;
  settings: SettingsSnapshot;
  connections: Array<{
    id: string;
    platform: string;
    platformUsername: string | null;
    profileImageUrl: string | null;
    isTwitterPremium: boolean;
  }>;
  isCredentialUser: boolean;
}> {
  return rpc("settings.loadSettingsPageData");
}

export async function getUserSettingsSnapshot(): Promise<SettingsSnapshot> {
  return rpc<SettingsSnapshot>("settings.getUserSettingsSnapshot");
}

export async function updateDisplayName(formData: FormData): Promise<void> {
  await rpc("settings.updateDisplayName", formData);
}

export async function updateUserImage(imageUrl: string): Promise<{ error?: string }> {
  return rpc<{ error?: string }>("settings.updateUserImage", imageUrl);
}

export async function updateConnectionAvatar(
  connectedAccountId: string,
  profileImageUrl: string,
): Promise<{ error?: string }> {
  return rpc<{ error?: string }>("settings.updateConnectionAvatar", connectedAccountId, profileImageUrl);
}

export async function updateAutomationEmails(formData: FormData): Promise<void> {
  await rpc("settings.updateAutomationEmails", formData);
}

export async function updatePlatformPreferences(formData: FormData): Promise<void> {
  await rpc("settings.updatePlatformPreferences", formData);
}

export async function updateTimezone(
  formData: FormData,
): Promise<{ error?: string }> {
  return (await rpc("settings.updateTimezone", formData)) ?? {};
}

export async function signOutAllDevices(): Promise<void> {
  await rpc("settings.signOutAllDevices");
}

export async function deleteAccount(
  confirmation: string,
): Promise<{ success: true } | { success: false; error: string }> {
  return rpc("settings.deleteAccount", confirmation);
}
