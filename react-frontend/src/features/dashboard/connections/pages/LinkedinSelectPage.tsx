"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { sanitizeReturnToPath } from "@/lib/safe-return-to";
import { assignSafeRedirectUrl } from "@/lib/safe-external-url";

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
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const returnTo =
    sanitizeReturnToPath(searchParams.get("returnTo")) ??
    "/dashboard/connections";

  const [personalProfile, setPersonalProfile] =
    useState<PersonalProfile | null>(null);
  const [companyPages, setCompanyPages] = useState<CompanyPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [selectedPersonal, setSelectedPersonal] = useState(true);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!token) {
      toast.error("Missing token");
      setLoading(false);
      return;
    }
    fetch(`/api/connect/linkedin/select?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok)
          return res
            .json()
            .then((d) =>
              Promise.reject(new Error(d.error ?? "Failed to load accounts")),
            );
        return res.json();
      })
      .then((data) => {
        setPersonalProfile(data.personalProfile ?? null);
        setCompanyPages(data.companyPages ?? []);
      })
      .catch((err) => {
        toast.error(err.message ?? "Failed to load accounts");
      })
      .finally(() => {
        setLoading(false);
      });
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
    async (e: React.FormEvent) => {
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
        const res = await fetch("/api/connect/linkedin/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            token,
            selectedIds: ids,
            returnTo,
          }),
          redirect: "follow",
        });
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          toast.error(
            data.message ??
              "You need an active plan to connect accounts and post content.",
          );
          setSubmitLoading(false);
          return;
        }
        if (res.redirected) {
          if (!assignSafeRedirectUrl(res.url)) {
            toast.error("Connection could not complete. Please try again.");
          }
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data.error) {
          toast.error(data.message ?? data.error);
        } else {
          window.location.href = returnTo;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setSubmitLoading(false);
      }
    },
    [token, returnTo, selectedPersonal, personalProfile, selectedCompanyIds],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">Loading accounts…</p>
      </div>
    );
  }

  if (!personalProfile && companyPages.length === 0) {
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

  if (!personalProfile) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">No LinkedIn profile found.</p>
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
    <div className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-1 text-center text-2xl font-bold text-foreground">
        Connect LinkedIn Accounts
      </h2>
      <p className="mb-6 text-center text-muted-foreground">
        Choose which LinkedIn accounts you want to connect.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Personal Profile
            </h3>
            <label className="flex cursor-pointer items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                checked={selectedPersonal}
                onChange={() => setSelectedPersonal((v) => !v)}
                className="h-4 w-4 rounded border-input text-accent focus:ring-accent"
              />
              {personalProfile.pictureUrl ? (
                <img
                  src={personalProfile.pictureUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
              )}
              <div>
                <span className="font-medium text-foreground">
                  {personalProfile.name}
                </span>
                <p className="text-xs text-muted-foreground">
                  Personal Profile
                </p>
              </div>
            </label>
          </div>

          {companyPages.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Business Pages
              </h3>
              <div className="space-y-1">
                {companyPages.map((page) => (
                  <label
                    key={page.urn}
                    className="flex cursor-pointer items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCompanyIds.has(page.urn)}
                      onChange={() => toggleCompany(page.urn)}
                      className="h-4 w-4 rounded border-input text-accent focus:ring-accent"
                    />
                    <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                    <div>
                      <span className="font-medium text-foreground">
                        {page.name}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        @{page.name.replace(/\s+/g, "").toLowerCase()}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Link
            href={returnTo}
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitLoading}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitLoading ? "Connecting…" : "Connect Selected"}
          </button>
        </div>
      </form>
    </div>
  );
}
