import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadCalendarPageData } from "@/api/dashboard-data";
import { fetchApi } from "@/lib/fetch-api";
import { toClientErrorMessage } from "@/lib/client-error-message";
import { useSession } from "@/lib/auth-client";
import { useTeamId } from "@/components/app";
import type { QueueSlotRow } from "./calendar-model";

/**
 * Calendar query key. Scoped by team so switching workspace never paints the
 * previous workspace's posts while the refetch runs.
 */
export function calendarQueryKey(teamId: string | null) {
  return ["calendar-page", teamId ?? "personal"] as const;
}

export function useCalendarQuery() {
  const { data: session, isPending: sessionPending } = useSession();
  const teamId = useTeamId();
  const query = useQuery({
    queryKey: calendarQueryKey(teamId),
    queryFn: loadCalendarPageData,
    enabled: !!session,
  });
  return { session, sessionPending, teamId, query };
}

async function loadQueueSlots(): Promise<QueueSlotRow[]> {
  const res = await fetchApi("/api/queue/slots");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(toClientErrorMessage(text, "Couldn't load your queue slots."));
  }
  const data: unknown = await res.json().catch(() => null);
  if (!Array.isArray(data)) return [];
  return data.filter(
    (r): r is QueueSlotRow =>
      !!r &&
      typeof r === "object" &&
      typeof (r as QueueSlotRow).id === "string" &&
      typeof (r as QueueSlotRow).hour === "number" &&
      typeof (r as QueueSlotRow).minute === "number",
  );
}

/** Posting-schedule slots (shown as ghost blocks). Degrades to none on error. */
export function useQueueSlots(enabled: boolean) {
  const teamId = useTeamId();
  return useQuery({
    queryKey: ["queue-slots", teamId ?? "personal"],
    queryFn: loadQueueSlots,
    enabled,
    staleTime: 60_000,
  });
}

/** Current time, refreshed every `intervalMs` (now line, past shading). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const MOBILE_QUERY = "(max-width: 767px)";

/** True below the md breakpoint (phones). */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const listener = () => setIsMobile(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return isMobile;
}
