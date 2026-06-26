import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signInUrl } from "@/lib/sign-in-url";
import { db } from "@/db";
import { connectedAccounts, account, user } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { SettingsClient } from "./SettingsClient";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_SETTINGS_URL } from "@/lib/docs-url";

export type SettingsConnection = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isTwitterPremium?: boolean;
};

/** Get UTC offset in minutes for a timezone (positive = east of UTC). Used for sorting. */
function getTimezoneOffsetMinutes(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = tzPart.replace(/^GMT\s*/i, "").trim();
    if (!m || m === "") return 0;
    const sign = m.startsWith("-") ? -1 : 1;
    const numPart = m.replace(/^[+-]/, "");
    const [h, min] = numPart.split(":").map((s) => parseInt(s ?? "0", 10));
    return sign * (h * 60 + (min || 0));
  } catch {
    return 0;
  }
}

/** Sort timezones by GMT offset (UTC first, then east, then west), then alphabetically by name. */
function sortTimezonesByOffset(tzList: string[]): string[] {
  return [...tzList].sort((a, b) => {
    const offsetA = getTimezoneOffsetMinutes(a);
    const offsetB = getTimezoneOffsetMinutes(b);
    if (offsetA !== offsetB) return offsetA - offsetB;
    return a.localeCompare(b);
  });
}

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect(signInUrl("/dashboard/settings"));
  }

  const rawTimeZones =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? (
          Intl as unknown as { supportedValuesOf(key: "timeZone"): string[] }
        ).supportedValuesOf("timeZone")
      : [
          "UTC",
          "America/New_York",
          "America/Los_Angeles",
          "Europe/London",
          "Europe/Paris",
          "Asia/Kolkata",
          "Asia/Tokyo",
          "Australia/Sydney",
        ];

  const timeZones = sortTimezonesByOffset(rawTimeZones);

  const [settings, connections, credentialAccount, profileRow] = await Promise.all([
    getUserSettingsSnapshot(),
    db.query.connectedAccounts.findMany({
      where: and(
        eq(connectedAccounts.userId, session.user.id),
        eq(connectedAccounts.isActive, true),
      ),
      columns: {
        id: true,
        platform: true,
        platformUsername: true,
        profileImageUrl: true,
        isTwitterPremium: true,
      },
    }),
    db.query.account.findFirst({
      where: and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "credential"),
      ),
      columns: { id: true },
    }),
    db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: { name: true, image: true, email: true },
    }),
  ]);

  const isCredentialUser = !!credentialAccount;

  const connectionsForClient: SettingsConnection[] = connections.map((c) => ({
    id: c.id,
    platform: c.platform,
    platformUsername: c.platformUsername,
    profileImageUrl: c.profileImageUrl,
    isTwitterPremium: c.isTwitterPremium ?? false,
  }));

  return (
    <SettingsClient
      displayName={profileRow?.name ?? session.user.name ?? ""}
      email={profileRow?.email ?? session.user.email ?? ""}
      image={profileRow?.image ?? session.user.image ?? null}
      settings={settings}
      connections={connectionsForClient}
      timeZones={timeZones}
      isCredentialUser={isCredentialUser}
    />
  );
}
