import { useSession } from "@/lib/auth-client";

/** True only after session fetch completes with no user (avoids guest UI flash on reload). */
export function useIsGuest(): boolean {
  const { data: session, isPending } = useSession();
  return !isPending && !session;
}

export function useSessionResolved(): {
  session: ReturnType<typeof useSession>["data"];
  isPending: boolean;
  isGuest: boolean;
} {
  const { data: session, isPending } = useSession();
  return {
    session,
    isPending,
    isGuest: !isPending && !session,
  };
}
