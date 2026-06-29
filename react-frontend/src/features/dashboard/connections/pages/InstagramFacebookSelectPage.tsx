"use client";

import { useSearchParams } from "@/lib/router";
import { useEffect } from "react";

/**
 * Redirect to the canonical Instagram select page under /dashboard/connections/instagram/select.
 * Keeps token and returnTo query params.
 */
export default function InstagramFacebookSelectRedirectPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const returnTo = searchParams.get("returnTo");
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (returnTo) params.set("returnTo", returnTo);
    window.location.replace(
      `/dashboard/connections/instagram/select${params.toString() ? `?${params.toString()}` : ""}`,
    );
  }, [searchParams]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <p className="text-muted-foreground">Redirecting…</p>
    </div>
  );
}
