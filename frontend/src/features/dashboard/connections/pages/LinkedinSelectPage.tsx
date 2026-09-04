import { useSearchParams } from "react-router-dom";
import { fetchApi } from "@/lib/fetch-api";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "@/components/AppLink";
import { toast } from "sonner";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";
import { completeConnectSelect } from "@/lib/connect-select-response";
import { stripSensitiveQueryParams } from "@/lib/sanitize-analytics-url";
import {
  AccountPickerEmpty,
  AccountPickerSkeleton,
} from "@/components/AccountPicker";
import { Button } from "@/components/ui/button";
import { CheckCircle, CircleNotch } from "@/icons/phosphor";
import { cn } from "@/lib/utils";

type PersonalProfile = {
  id: string;
  name: string;
  pictureUrl: string | null;
};

type CompanyPage = {
  id: string;
  urn: string;
  name: string;
};

export default function LinkedInSelectPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const returnTo =
    sanitizeReturnToPath(searchParams.get("returnTo")) ??
    "/dashboard/connections";

  const [personalProfile, setPersonalProfile] =
    useState<PersonalProfile | null>(null);
  const [companyPages, setCompanyPages] = useState<CompanyPage[]>([]);
  const [loading, setLoading] = useState(() => Boolean(token));
  const [submitLoading, setSubmitLoading] = useState(false);

  const [selectedPersonal, setSelectedPersonal] = useState(true);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    stripSensitiveQueryParams(["token"]);
  }, []);

  useEffect(() => {
    if (!token) {
      toast.error("Missing token");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchApi(
          `/api/connect/linkedin/select?token=${encodeURIComponent(token)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Failed to load accounts");
        }
        const data = await res.json();
        if (cancelled) return;
        setPersonalProfile(data.personalProfile ?? null);
        setCompanyPages(data.companyPages ?? []);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Failed to load accounts",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggleCompany = useCallback((urn: string) => {
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(urn)) next.delete(urn);
      else next.add(urn);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!token) return;
      const ids: string[] = [];
      if (selectedPersonal && personalProfile) ids.push(personalProfile.id);
      selectedCompanyIds.forEach((urn) => ids.push(urn));
      if (ids.length === 0) {
        toast.error("Select at least one account to connect.");
        return;
      }
      toast.dismiss();
      setSubmitLoading(true);
      try {
        const res = await fetchApi("/api/connect/linkedin/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            token,
            selectedIds: ids,
            returnTo,
          }),
          redirect: "manual",
        });
        await completeConnectSelect(res, returnTo);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setSubmitLoading(false);
      }
    },
    [token, returnTo, selectedPersonal, personalProfile, selectedCompanyIds],
  );

  const canSubmit =
    (selectedPersonal && Boolean(personalProfile)) ||
    selectedCompanyIds.size > 0;

  if (loading) {
    return (
      <AccountPickerSkeleton
        title="Connect LinkedIn"
        subtitle="Pick the profiles and pages you want to connect."
      />
    );
  }

  if (!personalProfile && companyPages.length === 0) {
    return (
      <AccountPickerEmpty
        title="Connect LinkedIn"
        message="No LinkedIn profiles or pages were found on this account."
        cancelHref={returnTo}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-2 dash-page-title">
        Connect LinkedIn
      </h1>
      <p className="text-sm leading-snug text-text-muted">
        Pick the profiles and pages you want to connect.
      </p>

      <form onSubmit={handleSubmit} className="mt-8">
        <div className="space-y-6">
          {personalProfile ? (
            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">
                Personal profile
              </p>
              <label
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-[background-color,border-color,transform] duration-150 ease-out focus-within:ring-2 focus-within:ring-accent/30 active:scale-[0.99]",
                  selectedPersonal
                    ? "border-accent bg-accent/10"
                    : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedPersonal}
                  onChange={() => setSelectedPersonal((v) => !v)}
                  className="sr-only"
                />
                {personalProfile.pictureUrl ? (
                  <img
                    src={personalProfile.pictureUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {personalProfile.name}
                </span>
                <CheckCircle
                  size={20}
                  weight={selectedPersonal ? "fill" : "regular"}
                  className={cn(
                    "shrink-0",
                    selectedPersonal
                      ? "text-accent"
                      : "text-muted-foreground/40",
                  )}
                  aria-hidden
                />
              </label>
            </div>
          ) : null}

          {companyPages.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-text-muted">
                Company pages
              </p>
              <div className="space-y-2">
                {companyPages.map((page) => {
                  const selected = selectedCompanyIds.has(page.urn);
                  return (
                    <label
                      key={page.urn}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-[background-color,border-color,transform] duration-150 ease-out focus-within:ring-2 focus-within:ring-accent/30 active:scale-[0.99]",
                        selected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleCompany(page.urn)}
                        className="sr-only"
                      />
                      <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {page.name}
                      </span>
                      <CheckCircle
                        size={20}
                        weight={selected ? "fill" : "regular"}
                        className={cn(
                          "shrink-0",
                          selected
                            ? "text-accent"
                            : "text-muted-foreground/40",
                        )}
                        aria-hidden
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="outline">
            <Link href={returnTo}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={!canSubmit || submitLoading}>
            {submitLoading ? (
              <>
                <CircleNotch size={16} className="animate-spin" />
                Connecting
              </>
            ) : (
              "Connect selected"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
