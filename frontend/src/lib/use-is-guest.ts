import { useSession } from "@/lib/auth-client";

/** True only after session fetch completes with no user (avoids guest UI flash on reload). */
export function useIsGuest(): boolean {
  const { data: session, isPending, isRefetching } = useSession();
  // Don't treat a transient refetch blip as signed-out.
  if (isPending || isRefetching) return false;
  return !session;
}

export function useSessionResolved(): {
  session: ReturnType<typeof useSession>["data"];
  isPending: boolean;
  isGuest: boolean;
} {
  const { data: session, isPending, isRefetching } = useSession();
  return {
    session,
    isPending,
    // Keep last-known session visible while refetching; only mark guest when
    // the session has settled empty (prevents banner/dialog flicker).
    isGuest: !isPending && !isRefetching && !session,
  };
}
