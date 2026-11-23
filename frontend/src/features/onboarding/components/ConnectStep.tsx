import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { getOnboardingStatus } from "@/api/onboarding";
import { loadConnectionsPageData } from "@/api/dashboard-data";
import { ConnectPlatformButton } from "@/components/dashboard/ConnectPlatformButton";
import {
  Banner,
  ErrorState,
  Meter,
  NetworkIcon,
  SkeletonCard,
  networkLabel,
} from "@/components/app";
import { PLATFORMS } from "@/lib/platforms";
import { getPlanLimits } from "@/lib/plans";
import { DOCS_ONBOARDING_CONNECT_URL } from "@/lib/docs-url";
import { cn } from "@/lib/utils";
import { goalCopy } from "@/features/onboarding/lib/goals";
import {
  ONBOARDING_CONNECT_RETURN,
  ONBOARDING_PATHS,
} from "@/features/onboarding/lib/paths";
import {
  OnboardingStepFrame,
  OnboardingStepHeader,
} from "./onboarding-ui";
import {
  onboardingGhostLinkClass,
  onboardingPrimaryCtaClass,
} from "./onboarding-styles";
import { SeePlansLink } from "./PlansDialog";

/** Poll while nothing is connected: Bluesky connects in a modal, and people
 * sometimes finish OAuth in another tab. */
const POLL_INTERVAL_MS = 2_000;

/** What kind of account each network takes, and what to know before connecting. */
const NETWORK_NOTES: Record<string, string> = {
  linkedin: "Profile or company page",
  facebook: "Pages only",
  bluesky: "Handle + app password",
  youtube: "Channel (Shorts)",
  pinterest: "Personal or business",
  instagram: "Business or Creator",
  tiktok: "Business or Creator",
  twitter_x: "Any account",
  threads: "Linked to Instagram",
};

/** OAuth result params the connect flow can land back with. */
const RESULT_PARAMS = ["connected", "success", "reauth", "error", "platform", "message"];

const CONNECTIONS_QUERY_KEY = ["onboarding-connections"] as const;

function platformName(id: string | null): string {
  if (!id) return "the account";
  return networkLabel(id) || id;
}

/** Toast what the OAuth round trip says, then drop the params. */
function useConnectResultNotices() {
  const [params, setParams] = useSearchParams();
  const connected = params.get("connected") ?? params.get("success");
  const error = params.get("error");
  const platform = params.get("platform");
  const message = params.get("message");

  useEffect(() => {
    if (!connected && !error) return;
    if (error) {
      toast.error(
        message?.trim() ||
          `Couldn't connect ${platformName(platform)}. Click Connect to try again.`,
        { id: `onboarding-connect-error-${error}` },
      );
    } else if (connected) {
      toast.success(`Connected ${platformName(connected)}.`, {
        id: `onboarding-connected-${connected}`,
      });
    }
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const k of RESULT_PARAMS) p.delete(k);
        return p;
      },
      { replace: true },
    );
  }, [connected, error, platform, message, setParams]);
}

/** Step 2: connect at least one account. Explainers live in ConnectPlatformButton
 * (Instagram's two methods, Bluesky app password, per-network requirements). */
export function ConnectStep({ onOpenPlans }: { onOpenPlans: () => void }) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  useConnectResultNotices();

  const { data: status } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
  });
  const hint = goalCopy(status?.onboardingGoal).connectHint;

  const connections = useQuery({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: () => loadConnectionsPageData(),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const result = query.state.data;
      if (!result?.ok) return false;
      const active = result.data.accounts.filter((a) => a.isActive !== false);
      return active.length === 0 ? POLL_INTERVAL_MS : false;
    },
  });

  const result = connections.data;
  const accounts = result?.ok
    ? result.data.accounts.filter((a) => a.isActive !== false)
    : [];
  const limitTotal = result?.ok ? (result.data.accountLimit?.limitTotal ?? 0) : 0;
  const hasConnected = accounts.length > 0;
  const atLimit = limitTotal > 0 && accounts.length >= limitTotal;

  // Analytics: one `account_connected` per newly seen account.
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!result?.ok) return;
    const ids = result.data.accounts
      .filter((a) => a.isActive !== false)
      .map((a) => ({ id: a.id, platform: a.platform }));
    if (seenIds.current === null) {
      seenIds.current = new Set(ids.map((a) => a.id));
      return;
    }
    for (const a of ids) {
      if (!seenIds.current.has(a.id)) {
        seenIds.current.add(a.id);
        posthog?.capture("account_connected", { platform: a.platform });
      }
    }
  }, [result, posthog]);

  const freeLimits = getPlanLimits("free");
  const loadFailed =
    connections.isError || (result !== undefined && result.ok === false);

  return (
    <OnboardingStepFrame wide>
      <OnboardingStepHeader
        step={2}
        back={ONBOARDING_PATHS.welcome}
        docsHref={DOCS_ONBOARDING_CONNECT_URL}
        title="Connect your accounts"
        description={`${hint} Social0 only posts what you or your agent send it, and you can disconnect anytime.`}
      />

      {loadFailed ? (
        <ErrorState
          message="Couldn't load your accounts."
          detail="Check your connection, then try again."
          onRetry={() => void connections.refetch()}
          retrying={connections.isFetching}
        />
      ) : connections.isPending ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 9 }, (_, i) => (
            <SkeletonCard key={i} lines={1} />
          ))}
        </div>
      ) : (
        <>
          {limitTotal > 0 ? (
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Meter
                value={accounts.length}
                max={limitTotal}
                label={`${accounts.length} of ${limitTotal} accounts connected`}
                className="sm:max-w-xs"
              />
              {limitTotal <= freeLimits.maxConnectedAccounts ? (
                <p className="text-[13px] text-muted-foreground">
                  Free includes {freeLimits.maxConnectedAccounts} accounts and{" "}
                  {freeLimits.maxFreePosts} posts.{" "}
                  <SeePlansLink onOpen={onOpenPlans} />
                </p>
              ) : null}
            </div>
          ) : null}

          {atLimit ? (
            <Banner
              tier="blocking"
              title={`You've connected ${limitTotal} of ${limitTotal} accounts.`}
              className="mb-4"
              actions={<SeePlansLink onOpen={onOpenPlans}>See plans</SeePlansLink>}
            >
              Upgrade to connect more, or carry on with these.
            </Banner>
          ) : null}

          <ul
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Networks"
          >
            {PLATFORMS.map((platform) => {
              const connected = accounts.filter((a) => a.platform === platform.id);
              const isConnected = connected.length > 0;
              const first = connected[0];
              const name = networkLabel(platform.id) || platform.name;
              return (
                <li
                  key={platform.id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors",
                    isConnected
                      ? "border-ok-border bg-ok-soft"
                      : "border-border bg-card/80",
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground">
                    <NetworkIcon network={platform.id} size={18} label="" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {name}
                    </span>
                    <span
                      className={cn(
                        "block text-xs text-muted-foreground",
                        isConnected ? "truncate" : "line-clamp-2 leading-snug",
                      )}
                    >
                      {isConnected && first
                        ? `@${first.platformUsername ?? first.platformDisplayName ?? "connected"}${
                            connected.length > 1 ? ` +${connected.length - 1}` : ""
                          }`
                        : (NETWORK_NOTES[platform.id] ?? "Official sign-in")}
                    </span>
                  </span>
                  {isConnected ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ok">
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Connected
                    </span>
                  ) : (
                    <ConnectPlatformButton
                      platform={platform}
                      size="default"
                      returnTo={ONBOARDING_CONNECT_RETURN}
                      disabled={atLimit}
                      onDisabledClick={onOpenPlans}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {hasConnected ? (
            <p className="mt-3 text-[13px] text-muted-foreground">
              You can add more later from Accounts in the sidebar.
            </p>
          ) : null}
        </>
      )}

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        {hasConnected ? (
          <span className="order-2 hidden sm:order-1 sm:block" />
        ) : (
          <button
            type="button"
            onClick={() => {
              posthog?.capture("onboarding_connect_skipped");
              navigate(ONBOARDING_PATHS.postMode);
            }}
            className={cn(onboardingGhostLinkClass, "order-2 sm:order-1")}
          >
            Skip for now
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(ONBOARDING_PATHS.postMode)}
          disabled={!hasConnected}
          className={cn(onboardingPrimaryCtaClass, "order-1 w-full sm:order-2 sm:w-auto")}
        >
          Continue
        </button>
      </div>
      {!hasConnected && !connections.isPending && !loadFailed ? (
        <p className="mt-3 text-center text-[13px] text-muted-foreground sm:text-right">
          Connect one account to continue. You can also do it later.
        </p>
      ) : null}
    </OnboardingStepFrame>
  );
}
