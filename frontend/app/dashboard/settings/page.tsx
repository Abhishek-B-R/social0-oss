import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts, account } from "@/db/schema";
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

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  const timeZones =
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

  const [settings, connections, credentialAccount] = await Promise.all([
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
    <>
      <a
        href={DOCS_SETTINGS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      <SettingsClient
        displayName={session.user.name ?? ""}
        email={session.user.email}
        image={session.user.image ?? null}
        settings={settings}
        connections={connectionsForClient}
        timeZones={timeZones}
        isCredentialUser={isCredentialUser}
      />
    </>
  );
}
