import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IconLoader2 } from "@tabler/icons-react";
import { acceptTeamInvite } from "@/api/team";
import Link from "@/components/AppLink";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";

type Status = "loading" | "success" | "error";

function isAlreadyAcceptedError(message: string): boolean {
  return /already been accepted/i.test(message);
}

export function AcceptInvitePage() {
  const { token: rawToken } = useParams<{ token: string }>();
  const token = rawToken?.trim() || null;
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [acceptState, setAcceptState] = useState<{
    status: Status;
    error: string | null;
  }>({ status: "loading", error: null });

  useEffect(() => {
    if (isPending) return;
    if (!token) return;
    if (!session) {
      navigate(signInUrl(`/invite/${token}`), { replace: true });
      return;
    }

    let cancelled = false;
    let redirectTimer: number | undefined;

    void (async () => {
      try {
        await acceptTeamInvite(token);
        if (cancelled) return;
        setAcceptState({ status: "success", error: null });
        redirectTimer = window.setTimeout(() => {
          navigate("/dashboard/teams", { replace: true });
        }, 1500);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to accept invitation";
        // Strict Mode / retries can race; treat idempotent accept as success.
        if (isAlreadyAcceptedError(message)) {
          setAcceptState({ status: "success", error: null });
          navigate("/dashboard/teams", { replace: true });
          return;
        }
        setAcceptState({ status: "error", error: message });
      }
    })();

    return () => {
      cancelled = true;
      if (redirectTimer !== undefined) {
        window.clearTimeout(redirectTimer);
      }
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

  if (acceptState.status === "success") {
    return (
      <InviteShell>
        <h1 className="font-serif text-xl font-semibold text-text">
          You&apos;re in
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Redirecting you to Teams…
        </p>
        <Link
          href="/dashboard/teams"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to Teams
        </Link>
      </InviteShell>
    );
  }

  if (acceptState.status === "error") {
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

  return (
    <InviteShell>
      <IconLoader2
        className="mx-auto h-8 w-8 animate-spin text-accent"
        strokeWidth={1.5}
      />
      <h1 className="mt-4 font-serif text-xl font-semibold text-text">
        Accepting invitation…
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        Hang tight while we add you to the workspace.
      </p>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg-elevated p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}

function InviteActions() {
  return (
    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
      <Link
        href="/dashboard/composer"
        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
      >
        Go to dashboard
      </Link>
      <Link
        href="/dashboard/teams"
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Open Teams
      </Link>
    </div>
  );
}
