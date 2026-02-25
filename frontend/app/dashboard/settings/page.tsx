import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserSettingsSnapshot } from "@/app/actions/settings";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/");
  }

  const settings = await getUserSettingsSnapshot();

  return (
    <SettingsClient
      displayName={session.user.name ?? ""}
      email={session.user.email}
      settings={settings}
    />
  );
}
