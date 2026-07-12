import { useSearchParams } from "react-router-dom";
import { fetchApi } from "@/lib/fetch-api";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/AppLink";
import {
  AccountPicker,
  type AccountPickerAccount,
} from "@/components/AccountPicker";
import { toast } from "sonner";
import { sanitizeReturnToPath } from "@social0/shared/browser";
import { completeConnectSelect } from "@/lib/connect-select-response";
import { stripSensitiveQueryParams } from "@/lib/sanitize-analytics-url";

export default function FacebookSelectPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const returnTo =
    sanitizeReturnToPath(searchParams.get("returnTo")) ??
    "/dashboard/connections";

  const [accounts, setAccounts] = useState<AccountPickerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    stripSensitiveQueryParams(["token"]);
  }, []);

  useEffect(() => {
    if (!token) {
      toast.error("Missing token");
      setLoading(false);
      return;
    }
    fetchApi(`/api/connect/facebook/select?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok)
          return res
            .json()
            .then((d) =>
              Promise.reject(new Error(d.error ?? "Failed to load pages")),
            );
        return res.json();
      })
      .then((data) => {
        setAccounts(
          (data.pages ?? []).map(
            (p: { id: string; name: string; pictureUrl?: string | null }) => ({
              id: p.id,
              name: p.name,
              pictureUrl: p.pictureUrl ?? null,
            }),
          ),
        );
      })
      .catch((err) => {
        toast.error(err.message ?? "Failed to load pages");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleSelect = useCallback(
    async (pageId: string) => {
      if (!token) return;
      toast.dismiss();
      setSubmitLoading(true);
      try {
        const res = await fetchApi("/api/connect/facebook/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, pageId, returnTo }),
          redirect: "manual",
        });
        await completeConnectSelect(res, returnTo);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setSubmitLoading(false);
      }
    },
    [token, returnTo],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">Loading pages…</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <Link
          href={returnTo}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Back to connections
        </Link>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">No Facebook Pages found.</p>
        <Link
          href={returnTo}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Back to connections
        </Link>
      </div>
    );
  }

  return (
    <AccountPicker
      accounts={accounts}
      title="Connect a Facebook Page"
      subtitle="Select a page to connect:"
      submitLabel="Connect Selected Page"
      onSelect={handleSelect}
      loading={submitLoading}
    />
  );
}
