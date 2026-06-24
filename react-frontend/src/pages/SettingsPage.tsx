import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSettingsPageData } from "@/actions/settings";
import { SettingsClient } from "@/features/dashboard/settings/SettingsClient";
import { useSession } from "@/lib/auth-client";
import { useNavigate } from "react-router-dom";
import { signInUrl } from "@/lib/sign-in-url";
import { useEffect } from "react";
import { MdQuestionMark } from "react-icons/md";
import { DOCS_SETTINGS_URL } from "@/lib/docs-url";

function getTimezoneOffsetMinutes(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = tzPart.replace(/^GMT\s*/i, "").trim();
    if (!m) return 0;
    const sign = m.startsWith("-") ? -1 : 1;
    const numPart = m.replace(/^[+-]/, "");
    const [h, min] = numPart.split(":").map((s) => parseInt(s ?? "0", 10));
    return sign * (h * 60 + (min || 0));
  } catch {
    return 0;
  }
}

function sortTimezonesByOffset(tzList: string[]): string[] {
  return [...tzList].sort((a, b) => {
    const offsetA = getTimezoneOffsetMinutes(a);
    const offsetB = getTimezoneOffsetMinutes(b);
    if (offsetA !== offsetB) return offsetA - offsetB;
    return a.localeCompare(b);
  });
}

export function SettingsPageClient() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["settings-page"],
    queryFn: loadSettingsPageData,
    enabled: !!session,
  });

  const timeZones = useMemo(() => {
    const raw =
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
    return sortTimezonesByOffset(raw);
  }, []);

  useEffect(() => {
    if (!isPending && !session) {
      navigate(signInUrl("/dashboard/settings"), { replace: true });
    }
  }, [isPending, session, navigate]);

  if (isLoading || !data || !session) return null;

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground landing">
          Settings
        </h1>
        <a
          href={DOCS_SETTINGS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full text-text-muted hover:text-text hover:bg-muted transition-colors"
          title="Documentation"
          aria-label="Documentation"
        >
          <MdQuestionMark className="w-5 h-5" />
        </a>
      </div>
      <SettingsClient
        displayName={data.displayName}
        email={data.email}
        image={data.image}
        settings={data.settings}
        connections={data.connections}
        timeZones={timeZones}
        isCredentialUser={data.isCredentialUser}
      />
    </>
  );
}
