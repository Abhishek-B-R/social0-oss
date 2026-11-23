import { useSearchParams } from "react-router-dom";
import { fetchApi } from "@/lib/fetch-api";

import { useCallback, useEffect, useState } from "react";
import {
  AccountPicker,
  AccountPickerEmpty,
  AccountPickerSkeleton,
  type AccountPickerAccount,
} from "@/components/AccountPicker";
import { toast } from "sonner";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { completeConnectSelect } from "@/lib/connect-select-response";
import { stripSensitiveQueryParams } from "@/lib/sanitize-analytics-url";
import { SelectLoadError } from "./SelectLoadError";

export default function FacebookSelectPage() {
  const [searchParams] = useSearchParams();
  const dash = useDashboardPath();
  const token = searchParams.get("token");
  const returnTo =
    sanitizeReturnToPath(searchParams.get("returnTo")) ?? dash("connections");

  const [accounts, setAccounts] = useState<AccountPickerAccount[]>([]);
  const [loading, setLoading] = useState(() => Boolean(token));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    stripSensitiveQueryParams(["token"]);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchApi(
          `/api/connect/facebook/select?token=${encodeURIComponent(token)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load pages");
        }
        const data = await res.json();
        if (cancelled) return;
        setAccounts(
          (data.pages ?? []).map(
            (p: { id: string; name: string; pictureUrl?: string | null }) => ({
              id: p.id,
              name: p.name,
              pictureUrl: p.pictureUrl ?? null,
            }),
          ),
        );
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load pages");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadAttempt]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadAttempt((n) => n + 1);
  }, []);

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

  if (!token || loadError) {
    return (
      <SelectLoadError
        title="Connect a Facebook Page"
        message="Couldn't load your pages. The sign-in link may have expired."
        detail={loadError}
        hasToken={Boolean(token)}
        onRetry={retryLoad}
        retrying={loading}
        startOverHref={dash("connections?connect=facebook")}
      />
    );
  }

  if (loading) {
    return (
      <AccountPickerSkeleton
        title="Connect a Facebook Page"
        subtitle="Pick the page you want to connect."
      />
    );
  }

  if (accounts.length === 0) {
    return (
      <AccountPickerEmpty
        title="Connect a Facebook Page"
        message="No Facebook Pages were found on this account."
        cancelHref={returnTo}
      />
    );
  }

  return (
    <AccountPicker
      accounts={accounts}
      title="Connect a Facebook Page"
      subtitle="Pick the page you want to connect."
      submitLabel="Connect selected"
      cancelHref={returnTo}
      onSelect={handleSelect}
      loading={submitLoading}
    />
  );
}
