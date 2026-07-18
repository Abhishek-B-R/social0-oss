import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IconLoader2 } from "@tabler/icons-react";
import { acceptTeamInvite } from "@/api/team";
import Link from "@/components/AppLink";
import { useSession } from "@/lib/auth-client";
import { writeTeamWorkspaceId } from "@/lib/dashboard-base-path";
import { signInUrl } from "@/lib/sign-in-url";

type Status = "loading" | "success" | "error";

/**
 * Legacy `/invite/:token` links: sign in if needed, accept the invite, then
 * land in the team app tree (never personal /dashboard, which would wipe the
 * activated workspace via PersonalWorkspaceBoot).
 */
export function AcceptInvitePage() {
  const { token: rawToken } = useParams<{ token: string }>();
  const token = rawToken?.trim() || null;
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [acceptState, setAcceptState] = useState<{
    status: Status;
    error: string | null;
  }>({ status: "loading", error: null });
  const startedRef = useRef(false);

  useEffect(() => {
    if (isPending) return;
    if (!token) return;
    if (!session) {
      navigate(signInUrl(`/invite/${token}`), { replace: true });
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const result = await acceptTeamInvite(token);
        if (cancelled) return;
        writeTeamWorkspaceId(result.teamId, result.workspaceId);
        setAcceptState({ status: "success", error: null });
        window.setTimeout(() => {
          window.location.assign(
            `/dashboard/teams/${result.teamId}/composer`,
          );
        }, 1200);
      } catch (err) {
        if (cancelled) return;
        setAcceptState({
          status: "error",
          error:
            err instanceof Error
              ? err.message
              : "Failed to accept invitation",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPending, session, token, navigate]);

  if (!token) {
    return (
      <InviteShell>
        <h1 className="font-serif text-xl font-semibold text-text">
          Couldn&apos;t accept invite
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          This invitation link is invalid.
        </p>
        <InviteActions />
      </InviteShell>
    );
  }

  if (isPending || (!session && acceptState.status === "loading")) {
    return (
      <InviteShell>
        <IconLoader2
          className="mx-auto h-8 w-8 animate-spin text-accent"
          strokeWidth={1.5}
        />
        <h1 className="mt-4 font-serif text-xl font-semibold text-text">
          Checking your session…
        </h1>
      </InviteShell>
    );
  }

  if (acceptState.status === "loading") {
    return (
      <InviteShell>
        <IconLoader2
          className="mx-auto h-8 w-8 animate-spin text-accent"
          strokeWidth={1.5}
        />
        <h1 className="mt-4 font-serif text-xl font-semibold text-text">
          Accepting invitation…
        </h1>
      </InviteShell>
    );
  }

  if (acceptState.status === "success") {
    return (
      <InviteShell>
        <h1 className="font-serif text-xl font-semibold text-text">
          You&apos;re in!
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Taking you to the team workspace…
        </p>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <h1 className="font-serif text-xl font-semibold text-text">
        Couldn&apos;t accept invite
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        {acceptState.error ?? "Something went wrong."}
      </p>
      <InviteActions />
    </InviteShell>
  );
}

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-8 text-center">
        {children}
      </div>
    </div>
  );
}

function InviteActions() {
  return (
    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
      <Link
        href="/dashboard"
        className="inline-flex h-9 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
