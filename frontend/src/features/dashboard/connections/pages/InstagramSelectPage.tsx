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

export default function InstagramSelectPage() {
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
          `/api/connect/instagram-facebook/select?token=${encodeURIComponent(token)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load accounts");
        }
        const data = await res.json();
        if (cancelled) return;
        const rawPages = data.pages ?? [];
        setAccounts(
          rawPages.map(
            (p: {
              pageId: string;
              pageName: string;
              instagramUsername?: string | null;
              instagramProfilePictureUrl?: string | null;
            }) => ({
              id: p.pageId,
              name:
                p.pageName +
                (p.instagramUsername ? ` (@${p.instagramUsername})` : ""),
              pictureUrl: p.instagramProfilePictureUrl ?? null,
            }),
          ),
        );
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load accounts");
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
        const res = await fetchApi("/api/connect/instagram-facebook/select", {
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
        title="Connect Instagram"
        message="Couldn't load your Instagram accounts. The sign-in link may have expired."
        detail={loadError}
        hasToken={Boolean(token)}
        onRetry={retryLoad}
        retrying={loading}
        startOverHref={dash("connections?connect=instagram")}
      />
    );
  }

  if (loading) {
    return (
      <AccountPickerSkeleton
        title="Connect Instagram"
        subtitle="Pick the account you want to connect."
      />
    );
  }

  if (accounts.length === 0) {
    return (
      <AccountPickerEmpty
        title="Connect Instagram"
        message="No Instagram accounts were found on this Facebook login."
        cancelHref={returnTo}
      />
    );
  }

  return (
    <AccountPicker
      accounts={accounts}
      title="Connect Instagram"
      subtitle="Pick the account you want to connect."
      submitLabel="Connect selected"
      cancelHref={returnTo}
      onSelect={handleSelect}
      loading={submitLoading}
    />
  );
}
