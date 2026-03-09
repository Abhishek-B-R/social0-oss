import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { SettingsClient } from "./SettingsClient";

export type SettingsConnection = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isTwitterPremium?: boolean;
};

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  const timeZones =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? (Intl as Intl & { supportedValuesOf?(key: "timeZone"): string[] }).supportedValuesOf("timeZone")
      : ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];

  const [settings, connections] = await Promise.all([
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
  ]);

  const connectionsForClient: SettingsConnection[] = connections.map((c) => ({
    id: c.id,
    platform: c.platform,
    platformUsername: c.platformUsername,
    profileImageUrl: c.profileImageUrl,
    isTwitterPremium: c.isTwitterPremium ?? false,
  }));

  return (
    <SettingsClient
      displayName={session.user.name ?? ""}
      email={session.user.email}
      image={session.user.image ?? null}
      settings={settings}
      connections={connectionsForClient}
      timeZones={timeZones}
    />
  );
}
