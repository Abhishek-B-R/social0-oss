import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Link from "@/components/AppLink";
import { MarketingPageLayout } from "@/components/landing/MarketingPageLayout";
import { SeoHead } from "@/components/seo/SeoHead";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { fetchApi } from "@/lib/fetch-api";
import { Bot, ExternalLink, ShieldCheck } from "lucide-react";

type SessionDetails = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  consentToken?: string;
};

export default function McpOAuthConnectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const session = searchParams.get("session");
  const [status, setStatus] = useState<"loading" | "ready" | "approving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function ensureSession() {
      if (!session) {
        setStatus("error");
        setError("Missing OAuth session. Start again from your AI assistant.");
        return;
      }

      try {
        const [current, detailsResponse] = await Promise.all([
          authClient.getSession(),
          fetchApi(`/api/oauth/mcp/session?session=${encodeURIComponent(session)}`),
        ]);

        if (cancelled) return;

        if (!detailsResponse.ok) {
          setStatus("error");
          setError("This authorization request expired. Start again from your AI assistant.");
          return;
        }

        const details = (await detailsResponse.json()) as SessionDetails;
        setSessionDetails(details);

        if (!current.data?.session) {
          const returnTo = `/oauth/mcp/connect?session=${encodeURIComponent(session)}`;
          navigate(`/auth?callbackUrl=${encodeURIComponent(returnTo)}`, { replace: true });
          return;
        }

        if (!details.consentToken) {
          setStatus("error");
          setError("Could not prepare a secure consent token. Reload the page and try again.");
          return;
        }

        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setError("Could not load this authorization request. Reload the page and try again.");
      }
    }

    void ensureSession();
    return () => {
      cancelled = true;
    };
  }, [navigate, session]);

  async function handleApprove() {
    if (!session || !sessionDetails?.consentToken) {
      setError("Missing consent token. Reload the page and try again.");
      return;
    }
    setStatus("approving");
    setError(null);

    try {
      const response = await fetchApi("/api/oauth/mcp/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, consentToken: sessionDetails.consentToken }),
      });

      const data = (await response.json()) as { redirectUrl?: string; error?: string };
      if (!response.ok || !data.redirectUrl) {
        throw new Error(data.error ?? "Could not complete Social0 authorization");
      }

      window.location.href = data.redirectUrl;
    } catch (err) {
      setStatus("ready");
      setError(err instanceof Error ? err.message : "Authorization failed");
    }
  }

  async function handleDeny() {
    if (!session) {
      navigate("/mcp");
      return;
    }

    try {
      const response = await fetchApi("/api/oauth/mcp/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      });
      const data = (await response.json()) as { redirectUrl?: string | null };
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
    } catch {
      // Fall through to client-side redirect if deny API is unavailable
    }

    if (!sessionDetails?.redirectUri) {
      navigate("/mcp");
      return;
    }

    const redirect = new URL(sessionDetails.redirectUri);
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "User denied the connection request");
    window.location.href = redirect.toString();
  }

  return (
    <MarketingPageLayout showCta={false}>
      <SeoHead
        title="Connect Social0 MCP"
        description="Authorize Claude or another AI assistant to publish posts, read analytics, and answer comments and DMs on your Social0 account."
        path="/oauth/mcp/connect"
        robots={{ index: false, follow: false }}
      />

      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-4 py-16">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-8 shadow-sm backdrop-blur">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Connect Social0 MCP</h1>
              <p className="text-sm text-muted-foreground">
                Review the application requesting access before you connect.
              </p>
            </div>
          </div>

          {sessionDetails ? (
            <div className="mb-6 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">{sessionDetails.clientName}</p>
              <p className="mt-1 text-muted-foreground">
                will be able to act on your Social0 account as you:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Create, schedule, publish, and delete posts on your connected networks</li>
                <li>Read live analytics for posts published through Social0</li>
                <li>Read comments and direct messages, and reply, like, or hide them publicly</li>
                <li>Manage media uploads, connected accounts, and webhooks</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                The connector key carries full API access; there is no narrower
                grant. Only connect assistants you trust to post and reply as you.
              </p>
              <p className="mt-3 flex items-start gap-2 break-all text-xs text-muted-foreground">
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                After approval, you will return to: {sessionDetails.redirectUri}
              </p>
            </div>
          ) : null}

          <div className="mb-6 space-y-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              Social0 will create a dedicated connector API key you can revoke anytime in Dashboard →
              API Keys.
            </p>
            <p>
              Connecting again replaces any previous MCP Connector key — existing
              sessions on that host will need to reconnect.
            </p>
            <p>
              By connecting, you agree to our{" "}
              <Link href="/terms" className="text-foreground underline-offset-4 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-foreground underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          {status === "loading" ? (
            <p className="mb-4 text-sm text-muted-foreground">Preparing secure connection…</p>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void handleApprove()}
              disabled={status !== "ready" || !session || !sessionDetails?.consentToken}
              className="min-w-40"
            >
              {status === "loading"
                ? "Loading…"
                : status === "approving"
                  ? "Connecting…"
                  : "Connect Social0"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleDeny()}
              disabled={status === "loading" || status === "approving"}
            >
              Deny
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/dashboard/api-keys">Manage API keys</Link>
            </Button>
          </div>
        </div>
      </div>
    </MarketingPageLayout>
  );
}
