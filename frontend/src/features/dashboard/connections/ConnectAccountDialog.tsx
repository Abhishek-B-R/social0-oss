import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronRight, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "@/components/AppLink";
import { Meter, NetworkIcon, networkLabel } from "@/components/app";
import { PRE_CONNECT } from "@/lib/preconnect";
import { signInUrl } from "@/lib/sign-in-url";
import { cn } from "@/lib/utils";
import { invalidateTeamRoomQueries } from "@/lib/team-query-keys";
import {
  NETWORK_ACCOUNT_TYPES,
  NETWORK_IDS,
  connectUrl,
  instagramFacebookConnectUrl,
  type NetworkId,
} from "./accounts-model";
import { connectBluesky } from "./use-account-details";

export type ConnectLimit = {
  current: number;
  max: number;
  planName: string;
};

type ConnectAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Jump straight to this network's explainer. */
  initialNetwork?: NetworkId | null;
  /** Prefill for Bluesky (updating an app password). */
  initialBlueskyHandle?: string;
  /** Where OAuth sends the user back to. */
  returnTo: string;
  /** Connected accounts per network, shown on the grid. */
  connectedCounts: Record<string, number>;
  /** Set when the plan's account limit is reached: shows the limit step instead. */
  atLimit: ConnectLimit | null;
  canAccessBilling: boolean;
  billingHref: string;
  /** Signed-out visitor: Continue goes to sign-in. */
  requireAuth?: boolean;
  /** Called after Bluesky connects in place (no redirect). */
  onConnected?: () => void;
  /** Agency: how accounts above the included ones are billed (info only). */
  billingNote?: string | null;
};

const WHAT_SOCIAL0_DOES =
  "Social0 publishes the posts you, a teammate or your AI agent send it, and reads stats and comments on those posts. Nothing is posted unless one of you asks.";

/**
 * "Connect account" modal: network grid → explainer (Instagram's two methods,
 * Bluesky's app password, each network's requirements) → OAuth. The OAuth
 * callbacks then land on the existing select pages (Facebook Page, Instagram
 * via Page, LinkedIn page) and come back to Accounts.
 */
export function ConnectAccountDialog(props: ConnectAccountDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open ? (
          <ConnectFlow
            // Remount per opening so the step resets.
            key={`${props.initialNetwork ?? "grid"}`}
            {...props}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ConnectFlow({
  onOpenChange,
  initialNetwork,
  initialBlueskyHandle,
  returnTo,
  connectedCounts,
  atLimit,
  canAccessBilling,
  billingHref,
  requireAuth = false,
  onConnected,
  billingNote,
}: ConnectAccountDialogProps) {
  const [network, setNetwork] = useState<NetworkId | null>(initialNetwork ?? null);
  // Bluesky with an existing handle updates that account, so it isn't blocked by the limit.
  const updatingBluesky = network === "bluesky" && !!initialBlueskyHandle;

  if (atLimit && !requireAuth && !updatingBluesky) {
    return (
      <LimitStep
        limit={atLimit}
        canAccessBilling={canAccessBilling}
        billingHref={billingHref}
        onClose={() => onOpenChange(false)}
      />
    );
  }

  if (!network) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Connect an account</DialogTitle>
          <DialogDescription>
            Pick a network. You can connect several accounts on each one.
          </DialogDescription>
        </DialogHeader>
        {billingNote ? (
          <p className="rounded-lg bg-bg-subtle px-3 py-2 text-xs text-text-muted">{billingNote}</p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {NETWORK_IDS.map((id) => {
            const count = connectedCounts[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setNetwork(id)}
                className="group flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-3 py-2.5 text-left transition-colors hover:border-text-subtle hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:flex-col sm:items-start sm:gap-2 sm:py-3"
              >
                <NetworkIcon network={id} size={20} label="" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">
                    {networkLabel(id)}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {NETWORK_ACCOUNT_TYPES[id]}
                  </span>
                  {count > 0 ? (
                    <span className="mt-0.5 block text-xs text-text-subtle">
                      {count} connected
                    </span>
                  ) : null}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-text-subtle sm:hidden"
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <NetworkStep
      network={network}
      onBack={() => setNetwork(null)}
      returnTo={returnTo}
      requireAuth={requireAuth}
      initialBlueskyHandle={initialBlueskyHandle}
      onClose={() => onOpenChange(false)}
      onConnected={onConnected}
    />
  );
}

function LimitStep({
  limit,
  canAccessBilling,
  billingHref,
  onClose,
}: {
  limit: ConnectLimit;
  canAccessBilling: boolean;
  billingHref: string;
  onClose: () => void;
}) {
  const noAccounts = limit.max <= 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {noAccounts ? "Choose a plan to connect accounts" : "You've used every account slot"}
        </DialogTitle>
        <DialogDescription>
          {noAccounts
            ? `Your ${limit.planName} plan doesn't include connected accounts right now.`
            : `${limit.current} of ${limit.max} accounts on ${limit.planName}. Upgrade to connect more, or disconnect one you no longer use.`}
        </DialogDescription>
      </DialogHeader>
      {!noAccounts ? (
        <Meter
          value={limit.current}
          max={limit.max}
          label={`${limit.current} of ${limit.max} accounts`}
          hint={limit.planName}
          size="md"
        />
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          Not now
        </Button>
        {canAccessBilling ? (
          <Button asChild>
            <Link href={billingHref} onClick={onClose}>
              {noAccounts ? "See plans" : "Upgrade plan"}
            </Link>
          </Button>
        ) : (
          <p className="self-center text-sm text-text-muted">
            Ask the workspace owner to upgrade the plan.
          </p>
        )}
      </div>
    </>
  );
}

function NetworkStep({
  network,
  onBack,
  returnTo,
  requireAuth,
  initialBlueskyHandle,
  onClose,
  onConnected,
}: {
  network: NetworkId;
  onBack: (() => void) | null;
  returnTo: string;
  requireAuth: boolean;
  initialBlueskyHandle?: string;
  onClose: () => void;
  onConnected?: () => void;
}) {
  const name = networkLabel(network);
  const [redirecting, setRedirecting] = useState(false);
  const [igMethod, setIgMethod] = useState<"direct" | "facebook-page">("direct");
  const pre = PRE_CONNECT[network];

  const go = (url: string) => {
    if (requireAuth) {
      window.location.href = signInUrl(returnTo);
      return;
    }
    setRedirecting(true);
    window.location.href = url;
  };

  const header = (
    <DialogHeader>
      <div className="flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to networks"
            className="-ml-1 inline-flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : null}
        <NetworkIcon network={network} size={20} label="" />
        <DialogTitle>Connect {name}</DialogTitle>
      </div>
      <DialogDescription className="sr-only">
        What {name} needs before you connect, then continue to sign in.
      </DialogDescription>
    </DialogHeader>
  );

  if (network === "bluesky") {
    return (
      <>
        {header}
        <BlueskyForm
          initialHandle={initialBlueskyHandle}
          requireAuth={requireAuth}
          returnTo={returnTo}
          onCancel={onClose}
          onConnected={() => {
            onClose();
            onConnected?.();
          }}
        />
      </>
    );
  }

  if (network === "instagram") {
    return (
      <>
        {header}
        <p className="text-sm text-text-muted">
          Instagram must be a Business or Creator account. Pick how it's set up:
        </p>
        <div role="radiogroup" aria-label="How to connect Instagram" className="space-y-2">
          <MethodCard
            selected={igMethod === "direct"}
            onSelect={() => setIgMethod("direct")}
            title="Instagram login"
            badge="Recommended"
            body="Sign in with your Instagram Business or Creator account. Your Instagram account must be linked to a Facebook Page."
          />
          <MethodCard
            selected={igMethod === "facebook-page"}
            onSelect={() => setIgMethod("facebook-page")}
            title="Through a Facebook Page"
            body="Sign in with Facebook and pick the Page your Instagram is linked to. Best if you manage several Pages with Instagram accounts."
          />
        </div>
        <WhatWeDo />
        <StepActions
          onCancel={onClose}
          redirecting={redirecting}
          continueLabel={
            igMethod === "direct" ? "Continue to Instagram" : "Continue to Facebook"
          }
          onContinue={() =>
            go(
              igMethod === "direct"
                ? connectUrl("instagram", returnTo)
                : instagramFacebookConnectUrl(returnTo),
            )
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      {pre ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm font-medium text-text">
            <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
              <Check className="size-3" aria-hidden />
            </span>
            {pre.checkmark}
          </p>
          <p className="whitespace-pre-line text-sm text-text-muted">{pre.info}</p>
        </div>
      ) : null}
      <WhatWeDo />
      <StepActions
        onCancel={onClose}
        redirecting={redirecting}
        continueLabel={`Continue to ${name}`}
        onContinue={() => go(connectUrl(network, returnTo))}
      />
    </>
  );
}

function MethodCard({
  selected,
  onSelect,
  title,
  body,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        selected
          ? "border-text bg-bg-subtle"
          : "border-border bg-bg-elevated hover:border-text-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-text" : "border-border",
        )}
      >
        {selected ? <span className="size-2 rounded-full bg-text" /> : null}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
          {title}
          {badge ? (
            <span className="text-xs font-normal text-text-muted">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-text-muted">{body}</span>
      </span>
    </button>
  );
}

function WhatWeDo() {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-bg-subtle px-3 py-2.5 text-xs text-text-muted">
      <ShieldCheck className="mt-px size-4 shrink-0 text-ok" aria-hidden />
      {WHAT_SOCIAL0_DOES}
    </p>
  );
}

function StepActions({
  onCancel,
  onContinue,
  continueLabel,
  redirecting,
}: {
  onCancel: () => void;
  onContinue: () => void;
  continueLabel: string;
  redirecting: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={onCancel} disabled={redirecting}>
        Cancel
      </Button>
      <Button onClick={onContinue} disabled={redirecting}>
        {redirecting ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        {redirecting ? "Opening sign-in…" : continueLabel}
      </Button>
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm text-text placeholder:text-text-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 touch:h-11";

function BlueskyForm({
  initialHandle,
  requireAuth,
  returnTo,
  onCancel,
  onConnected,
}: {
  initialHandle?: string;
  requireAuth: boolean;
  returnTo: string;
  onCancel: () => void;
  onConnected: () => void;
}) {
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState(initialHandle ?? "");
  const [appPassword, setAppPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (requireAuth) {
      window.location.href = signInUrl(returnTo);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const username = await connectBluesky({ handle: handle.trim(), appPassword });
      toast.success(
        initialHandle ? `Updated @${username}.` : `Connected @${username} on Bluesky.`,
      );
      // Accounts feed Analytics/Inbox chips, Home, Calendar and Posts too.
      void invalidateTeamRoomQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect Bluesky.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1 text-sm text-text-muted">
        <p>
          Bluesky uses an <span className="font-medium text-text">app password</span>,
          not your main password. Create one in Bluesky under Settings → Privacy and
          security → App passwords, then paste it here.
        </p>
        <a
          href="https://bsky.app/settings/app-passwords"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline"
        >
          Open Bluesky app passwords
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="bsky-handle" className="text-sm font-medium text-text">
          Handle
        </label>
        <input
          id="bsky-handle"
          className={inputCls}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="yourname.bsky.social"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="bsky-app-password" className="text-sm font-medium text-text">
          App password
        </label>
        <input
          id="bsky-app-password"
          type="password"
          className={inputCls}
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          autoComplete="off"
          required
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <WhatWeDo />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !handle.trim() || !appPassword}>
          {submitting ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {submitting ? "Connecting…" : initialHandle ? "Update app password" : "Connect Bluesky"}
        </Button>
      </div>
    </form>
  );
}
