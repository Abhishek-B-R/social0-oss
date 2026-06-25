import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { loadSettingsPageData } from "@/actions/settings";
import { SettingsClient } from "@/features/dashboard/settings/SettingsClient";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";
import { DashboardPageSkeleton } from "@/components/ui/dashboard-page-skeleton";

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
  const { data: session, isPending: sessionPending } = useSession();
  const navigate = useNavigate();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
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
    if (!sessionPending && !session) {
      navigate(signInUrl("/dashboard/settings"), { replace: true });
    }
  }, [sessionPending, session, navigate]);

  if (sessionPending || (session && isLoading)) {
    return <DashboardPageSkeleton message="Loading settings..." />;
  }

  if (!session) {
    return null;
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-foreground">
        <p className="text-muted-foreground">
          {isError
            ? (error instanceof Error ? error.message : "Could not load settings.")
            : "Could not load settings."}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <SettingsClient
      displayName={data.displayName}
      email={data.email}
      image={data.image}
      settings={data.settings}
      connections={data.connections}
      timeZones={timeZones}
      isCredentialUser={data.isCredentialUser}
    />
  );
}
