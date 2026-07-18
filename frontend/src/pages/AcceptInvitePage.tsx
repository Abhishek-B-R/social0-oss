import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Link from "@/components/AppLink";
import { useSession } from "@/lib/auth-client";
import { signInUrl } from "@/lib/sign-in-url";

/**
 * Legacy `/invite/:token` links now funnel into sign-in → dashboard,
 * where pending invites are accepted in-app.
 */
export function AcceptInvitePage() {
  const { token: rawToken } = useParams<{ token: string }>();
  const token = rawToken?.trim() || null;
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      navigate(signInUrl("/dashboard"), { replace: true });
      return;
    }
    navigate("/dashboard", { replace: true });
  }, [isPending, session, navigate]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-8 text-center">
          <h1 className="font-serif text-xl font-semibold text-text">
            Invalid invitation link
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Sign in to Social0 to see any pending team invitations on your
            dashboard.
          </p>
          <Link
            href={signInUrl("/dashboard")}
            className="mt-6 inline-flex h-9 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-bg-elevated p-8 text-center">
        <p className="text-sm text-text-muted">Taking you to your dashboard…</p>
      </div>
    </div>
  );
}
