import { useNavigate } from "react-router-dom";
import { fetchApi } from "@/lib/fetch-api";
import { useState, useEffect, useRef } from "react";
import { usePostHog } from "@posthog/react";
import { useQuery } from "@tanstack/react-query";
import Link from "@/components/AppLink";
import { PLATFORMS } from "@/lib/platforms";
import { setOnboardingCompleted } from "@/api/onboarding";
import { getOnboardingStatus } from "@/api/onboarding";
import { getPlatformIcon } from "@/lib/platform-icons";
import { getPlanLimits } from "@/lib/plans";
import { ConnectPlatformButton } from "@/components/dashboard/ConnectPlatformButton";
import { goalCopy } from "@/features/onboarding/lib/goals";
import {
  ONBOARDING_CONNECT_RETURN,
  ONBOARDING_PATHS,
} from "@/features/onboarding/lib/paths";
import {
  OnboardingDocsLink,
  OnboardingStepFrame,
  OnboardingStepHeader,
  onboardingGhostLinkClass,
  onboardingPrimaryCtaClass,
  onboardingSecondaryCtaClass,
} from "@/features/onboarding/components/onboarding-ui";
import { DOCS_ONBOARDING_CONNECT_URL } from "@/lib/docs-url";
import { cn } from "@/lib/utils";

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

const POLL_INTERVAL_MS = 2000;

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

type ConnectStepProps = {
  initialAccounts?: Account[];
  limitTotal: number;
  hasUsedTrial: boolean;
};

export function ConnectStep({
  initialAccounts = [],
  limitTotal,
}: ConnectStepProps) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [skipping, setSkipping] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const pollStopped = useRef(initialAccounts.length >= 1);
  const prevActiveCountRef = useRef(
    initialAccounts.filter((a) => a.isActive !== false).length,
  );

  const { data: status } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
  });
  const hint = goalCopy(status?.onboardingGoal).connectHint;

  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const hasConnected = activeAccounts.length > 0;
  const atLimit = activeAccounts.length >= limitTotal;

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetchApi("/api/accounts", { credentials: "include" });
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

  useEffect(() => {
    const prev = prevActiveCountRef.current;
    if (activeAccounts.length > prev) {
      const newAccounts = activeAccounts.slice(prev);
      newAccounts.forEach((account) => {
        posthog?.capture("account_connected", { platform: account.platform });
      });
    }
    prevActiveCountRef.current = activeAccounts.length;
  }, [activeAccounts, posthog]);

  async function handleSkipToDashboard() {
    setSkipping(true);
    posthog?.capture("onboarding_skipped", { at: "connect" });
    try {
      await setOnboardingCompleted();
      navigate("/dashboard");
    } finally {
      setSkipping(false);
    }
  }

  return (
    <OnboardingStepFrame>
      <div className="relative w-full">
        <OnboardingDocsLink href={DOCS_ONBOARDING_CONNECT_URL} />

        <OnboardingStepHeader
          eyebrow="Activation"
          title={
            <>
              Connect{" "}
              <em className="not-italic text-emerald-600 dark:text-emerald-400">
                one
              </em>{" "}
              social account
            </>
          }
          description={hint}
        />

        {limitTotal > 0 && limitTotal <= 3 ? (
          <p className="mb-5 text-center text-[13px] text-muted-foreground">
            Free plan includes up to {limitTotal} accounts ·{" "}
            {getPlanLimits("free").maxFreePosts} posts
          </p>
        ) : null}

        {limitTotal > 0 ? (
          <div className="mb-5 flex items-center justify-center gap-3">
            <div
              className="h-1.5 w-32 overflow-hidden rounded-full bg-border/80 sm:w-40"
              role="progressbar"
              aria-valuenow={activeAccounts.length}
              aria-valuemin={0}
              aria-valuemax={limitTotal}
              aria-label="Accounts connected"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, (activeAccounts.length / limitTotal) * 100)}%`,
                }}
              />
            </div>
            <span className="text-[13px] font-medium tabular-nums text-foreground">
              {activeAccounts.length}/{limitTotal}
            </span>
          </div>
        ) : null}

        {atLimit ? (
          <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-900 dark:text-amber-100">
            You&apos;ve reached your {limitTotal} account limit.{" "}
            <Link
              href={ONBOARDING_PATHS.plan}
              className="font-semibold underline underline-offset-2 hover:no-underline"
            >
              Upgrade your plan →
            </Link>
          </div>
        ) : null}

        <div className="mb-8 rounded-[22px] border border-border/70 bg-card/80 p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-sm sm:p-5">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 transition-colors",
                    isConnected
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-border/70 bg-background/50 hover:border-border hover:bg-muted/30",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white",
                        ui.color,
                      )}
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
                      <p className="truncate text-sm font-semibold text-foreground">
                        {platform.name}
                      </p>
                      {isConnected && firstAccount ? (
                        <p className="truncate text-xs text-muted-foreground">
                          @{firstAccount.platformUsername ?? "connected"}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Official OAuth
                        </p>
                      )}
                    </div>
                  </div>
                  {isConnected ? (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Connected
                    </span>
                  ) : (
                    <ConnectPlatformButton
                      platform={platform}
                      size="default"
                      returnTo={ONBOARDING_CONNECT_RETURN}
                      disabled={atLimit}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {hasConnected ? (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Add more accounts later from{" "}
              <Link
                href="/dashboard/connections"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Connections
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-center gap-3">
          {hasConnected ? (
            <>
              <Link
                href={ONBOARDING_PATHS.plan}
                className={cn(onboardingPrimaryCtaClass, "w-full sm:w-auto")}
              >
                Continue
                <span aria-hidden>→</span>
              </Link>
              <p className="text-[13px] text-muted-foreground">
                Next: optional upgrade — or stay on free
              </p>
            </>
          ) : (
            <>
              <p className="max-w-sm text-center text-[13px] text-muted-foreground">
                Connecting unlocks scheduling. You can always do this later from
                the dashboard.
              </p>
              <button
                type="button"
                onClick={() => navigate(ONBOARDING_PATHS.plan)}
                className={cn(onboardingSecondaryCtaClass, "w-full sm:w-auto")}
              >
                Continue without connecting
              </button>
              <button
                type="button"
                onClick={() => void handleSkipToDashboard()}
                disabled={skipping}
                className={onboardingGhostLinkClass}
              >
                {skipping ? "Opening dashboard…" : "Skip setup — go to dashboard"}
              </button>
            </>
          )}
        </div>
      </div>
    </OnboardingStepFrame>
  );
}
