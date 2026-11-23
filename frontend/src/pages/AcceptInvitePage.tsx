import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CircleNotch,
} from "@/icons/phosphor";
import { acceptTeamInvite } from "@/api/team";
import Link from "@/components/AppLink";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";
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
    // Accept exactly once. No cleanup flag: under StrictMode the effect is
    // torn down and re-run, and a cancelled first run would leave the page
    // spinning on "Accepting invitation" forever.
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const result = await acceptTeamInvite(token);
        writeTeamWorkspaceId(result.teamId, result.workspaceId);
        setAcceptState({ status: "success", error: null });
        window.setTimeout(() => {
          window.location.assign(
            `/dashboard/teams/${result.teamId}/home`,
          );
        }, 1200);
      } catch (err) {
        setAcceptState({
          status: "error",
          error:
            err instanceof Error
              ? err.message
              : "Failed to accept invitation",
        });
      }
    })();
  }, [isPending, session, token, navigate]);

  if (!token) {
    return (
      <InviteShell>
        <h1 className="font-sans text-2xl font-bold tracking-tight text-foreground dark:text-white">
          Couldn&apos;t accept invite
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          This invitation link is invalid.
        </p>
        <InviteActions />
      </InviteShell>
    );
  }

  if (isPending || (!session && acceptState.status === "loading")) {
    return (
      <InviteShell>
        <CircleNotch
          className="mx-auto h-8 w-8 animate-spin text-emerald-500"
          aria-hidden
        />
        <h1 className="mt-4 font-sans text-2xl font-bold tracking-tight text-foreground dark:text-white">
          Checking your session…
        </h1>
      </InviteShell>
    );
  }

  if (acceptState.status === "loading") {
    return (
      <InviteShell>
        <CircleNotch
          className="mx-auto h-8 w-8 animate-spin text-emerald-500"
          aria-hidden
        />
        <h1 className="mt-4 font-sans text-2xl font-bold tracking-tight text-foreground dark:text-white">
          Accepting invitation…
        </h1>
      </InviteShell>
    );
  }

  if (acceptState.status === "success") {
    return (
      <InviteShell>
        <h1 className="font-sans text-2xl font-bold tracking-tight text-foreground dark:text-white">
          You&apos;re in!
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Taking you to the team workspace…
        </p>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <h1 className="font-sans text-2xl font-bold tracking-tight text-foreground dark:text-white">
        Couldn&apos;t accept invite
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {acceptState.error ?? "Something went wrong."}
      </p>
      <InviteActions />
    </InviteShell>
  );
}

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="landing landing-page flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <AuthBrandHeader />
      <main
        className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16"
        aria-live="polite"
      >
        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-[28px] border border-border bg-muted/40 p-1.5 dark:border-white/10 dark:bg-[#1A1A1A]">
            <div className="rounded-[22px] border border-border/60 bg-background p-7 text-center dark:border-white/5 dark:bg-[#111111] sm:p-9">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function InviteActions() {
  return (
    <div className="mt-6">
      <Link
        href="/dashboard"
        className="inline-flex w-full items-center justify-center rounded-[10px] bg-emerald-500 px-4 py-3 font-semibold text-[#04140c] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
