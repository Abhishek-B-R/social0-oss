
import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useDashboardBasePath } from "@/lib/dashboard-base-path";

/**
 * Redirect to the canonical Instagram select page under the current dashboard
 * base (personal or team). Keeps token and returnTo query params.
 */
export default function InstagramFacebookSelectRedirectPage() {
  const [searchParams] = useSearchParams();
  const base = useDashboardBasePath();

  useEffect(() => {
    const token = searchParams.get("token");
    const returnTo = searchParams.get("returnTo");
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (returnTo) params.set("returnTo", returnTo);
    const qs = params.toString();
    window.location.replace(
      `${base}/connections/instagram/select${qs ? `?${qs}` : ""}`,
    );
  }, [searchParams, base]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <p className="text-muted-foreground">Redirecting…</p>
    </div>
  );
}
