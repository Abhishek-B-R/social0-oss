"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PLATFORMS } from "@/lib/platforms";
import { setOnboardingCompleted } from "@/app/actions/onboarding";
import { getPlatformIcon } from "@/lib/platform-icons";
import { getPlanLimits } from "@/lib/plans";
import { ConnectPlatformButton } from "@/components/dashboard/ConnectPlatformButton";

const PLATFORM_UI: Record<string, { name: string; color: string }> = {
  linkedin: { name: "LinkedIn", color: "bg-[#0A66C2]" },
  facebook: { name: "Facebook", color: "bg-[#1877F2]" },
  bluesky: { name: "Bluesky", color: "bg-[#0085FF]" },
  youtube: { name: "YouTube", color: "bg-[#FF0000]" },
  pinterest: { name: "Pinterest", color: "bg-[#E60023]" },
  instagram: {
    name: "Instagram",
    color: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  tiktok: { name: "TikTok", color: "bg-[#000000]" },
  twitter_x: { name: "X (Twitter)", color: "bg-[#000000]" },
  threads: { name: "Threads", color: "bg-[#000000]" },
};

const ONBOARDING_RETURN = "/onboarding/step3";
const POLL_INTERVAL_MS = 2000;

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

type ConnectStepClientProps = {
  initialAccounts?: Account[];
  /** Plan limit for connected accounts (e.g. 5 for starter, 15 for growth). */
  limitTotal: number;
  /** True once user has ever had a paid plan. When limit is 0, drives trial vs upgrade message. */
  hasUsedTrial: boolean;
};

export function ConnectStepClient({
  initialAccounts = [],
  limitTotal,
  hasUsedTrial,
}: ConnectStepClientProps) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const pollStopped = useRef(initialAccounts.length >= 1);

  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const hasConnected = activeAccounts.length > 0;
  const atLimit = activeAccounts.length >= limitTotal;

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch("/api/accounts", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) setAccounts(data);
      } catch {
        // ignore
      }
    }

    fetchAccounts();
    const interval = setInterval(() => {
      if (pollStopped.current) {
        clearInterval(interval);
        return;
      }
      fetchAccounts();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeAccounts.length >= 1) pollStopped.current = true;
  }, [activeAccounts.length]);

  async function handleSkip() {
    setSkipping(true);
    try {
      await setOnboardingCompleted();
      router.push("/dashboard");
    } finally {
      setSkipping(false);
    }
  }

  return (
    <>
      <div className="flex w-full flex-1 flex-col">
        <h1 className="mb-2 text-center font-serif text-2xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-3xl">
          Connect a social account
        </h1>
        <p className="text-center text-muted-foreground mb-2">
          Pick one platform to get started - you can add more anytime.
        </p>
        {limitTotal > 0 && limitTotal <= 3 && (
          <p className="text-center text-xs text-muted-foreground mb-6">
            Free plan: up to {limitTotal} accounts · {getPlanLimits("free").maxFreePosts} posts included
          </p>
        )}
        {(!limitTotal || limitTotal > 3) && <div className="mb-6" />}

        {limitTotal > 0 && (
          <p className="text-center text-sm text-muted-foreground mb-4">
            <span className="font-medium text-foreground">
              {activeAccounts.length}/{limitTotal} accounts connected
            </span>
          </p>
        )}
        {atLimit && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 text-center mb-4">
            You&apos;ve reached your {limitTotal} account limit.{" "}
            <Link
              href="/dashboard/billing"
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              Upgrade →
            </Link>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm mb-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORMS.map((platform) => {
              const ui = PLATFORM_UI[platform.id] ?? {
                name: platform.name,
                color: "bg-gray-500",
              };
              const Icon = getPlatformIcon(platform.id);
              const platformAccounts = activeAccounts.filter(
                (a) => a.platform === platform.id,
              );
              const isConnected = platformAccounts.length > 0;
              const firstAccount = platformAccounts[0];

              return (
                <div
                  key={platform.id}
                  className="flex items-center justify-between w-full rounded-xl border border-border bg-muted/30 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ui.color} text-white`}
                    >
                      {Icon ? (
                        <Icon className="h-5 w-5" />
                      ) : (
                        <span className="text-sm font-bold">
                          {platform.name[0]}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {platform.name}
                      </p>
                      {isConnected && firstAccount ? (
                        <p className="text-xs text-muted-foreground truncate">
                          @{firstAccount.platformUsername ?? "connected"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {isConnected ? (
                    <span className="shrink-0 text-xs font-medium text-green-600 bg-green-500/10 px-3 py-1 rounded-full">
                      ✓ Connected
                    </span>
                  ) : (
                    <ConnectPlatformButton
                      platform={platform}
                      size="default"
                      returnTo={ONBOARDING_RETURN}
                      disabled={atLimit}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {hasConnected && (
            <p className="text-xs text-center text-muted-foreground mt-3">
              Connect additional accounts per platform from{" "}
              <Link
                href="/dashboard/connections"
                className="underline hover:text-foreground"
              >
                dashboard
              </Link>
            </p>
          )}
        </div>

        <div className="flex flex-col items-center justify-center gap-3">
          {hasConnected ? (
            <Link
              href="/onboarding/step4"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
            >
              Continue →
            </Link>
          ) : (
            <>
              <p className="text-xs text-center text-muted-foreground max-w-sm">
                You can connect later from the dashboard - nothing is lost if
                you skip this step.
              </p>
              <button
                type="button"
                onClick={handleSkip}
                disabled={skipping}
                className="inline-flex items-center justify-center rounded-xl border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                {skipping
                  ? "Opening dashboard…"
                  : "Skip for now - go to dashboard"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
