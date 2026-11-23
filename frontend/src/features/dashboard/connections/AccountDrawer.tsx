import { useState, type ReactNode } from "react";
import { Crown, KeyRound, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Link from "@/components/AppLink";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  Banner,
  Drawer,
  NetworkIcon,
  Skeleton,
  networkLabel,
} from "@/components/app";
import {
  accountQualifier,
  accountTitle,
  pinterestDefaultBoardId,
  type AccountRow,
} from "./accounts-model";
import { refreshXPremium, useAccountPublicationCount } from "./use-account-details";
import { PinterestBoardSetting } from "./PinterestBoardSetting";
import { updateConnectionAvatar } from "@/api/settings";
import { AvatarEditor } from "@/features/dashboard/settings/sections/AvatarEditor";

type AccountDrawerProps = {
  account: AccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** platformMetadata for this account; undefined while loading, null if it failed. */
  metadata: Record<string, unknown> | null | undefined;
  canManage: boolean;
  canAccessBilling: boolean;
  billingHref: string;
  accountLimitMax: number | null;
  onDisconnect: (account: AccountRow) => void;
  /** Bluesky: reopen the connect form with this handle to replace the app password. */
  onUpdateBlueskyPassword: (account: AccountRow) => void;
  onAccountsChanged: () => void;
};

/** Right-hand sheet with one account's status and settings. */
export function AccountDrawer({
  account,
  open,
  onOpenChange,
  metadata,
  canManage,
  canAccessBilling,
  billingHref,
  accountLimitMax,
  onDisconnect,
  onUpdateBlueskyPassword,
  onAccountsChanged,
}: AccountDrawerProps) {
  return (
    <Drawer
      open={open && !!account}
      onOpenChange={onOpenChange}
      title={account ? accountTitle(account) : "Account"}
      description={
        account
          ? [networkLabel(account.platform), accountQualifier(account, metadata ?? undefined)]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      width="md"
      footer={
        account && canManage ? (
          <Button
            variant="outline"
            className="mr-auto border-danger-border text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => onDisconnect(account)}
          >
            <Unplug aria-hidden />
            Disconnect
          </Button>
        ) : undefined
      }
    >
      {account ? (
        <AccountDrawerBody
          // Reset local state (premium refresh errors etc.) per account.
          key={account.id}
          account={account}
          metadata={metadata}
          canManage={canManage}
          canAccessBilling={canAccessBilling}
          billingHref={billingHref}
          accountLimitMax={accountLimitMax}
          onUpdateBlueskyPassword={onUpdateBlueskyPassword}
          onAccountsChanged={onAccountsChanged}
        />
      ) : null}
    </Drawer>
  );
}

function AccountDrawerBody({
  account,
  metadata,
  canManage,
  canAccessBilling,
  billingHref,
  accountLimitMax,
  onUpdateBlueskyPassword,
  onAccountsChanged,
}: Omit<AccountDrawerProps, "open" | "onOpenChange" | "account" | "onDisconnect"> & {
  account: AccountRow;
}) {
  const network = networkLabel(account.platform);
  const publications = useAccountPublicationCount(account.id);
  const [premiumPending, setPremiumPending] = useState(false);
  const [premiumError, setPremiumError] = useState<string | null>(null);

  const recheckPremium = async () => {
    setPremiumPending(true);
    setPremiumError(null);
    try {
      await refreshXPremium();
      onAccountsChanged();
      toast.success("X Premium status rechecked.");
    } catch (err) {
      setPremiumError(err instanceof Error ? err.message : "Couldn't recheck X Premium.");
    } finally {
      setPremiumPending(false);
    }
  };

  const isBluesky = account.platform === "bluesky";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative">
          <AccountAvatar
            profileImageUrl={account.profileImageUrl}
            username={account.platformUsername}
            platform={account.platform}
            size="lg"
          />
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-bg-elevated p-0.5">
            <NetworkIcon network={account.platform} size={14} label="" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{accountTitle(account)}</p>
          {account.platformDisplayName && account.handle !== accountTitle(account) ? (
            <p className="truncate text-xs text-text-muted">{account.handle}</p>
          ) : null}
        </div>
      </div>

      {account.health === "expired" ? (
        <Banner
          tier="blocking"
          title="Sign-in expired."
          actions={
            canManage ? (
              <Button asChild size="sm">
                <a href={account.reconnectHref}>Reconnect</a>
              </Button>
            ) : undefined
          }
        >
          {canManage
            ? `Posts to this account will fail until you sign in to ${network} again.`
            : `Posts to this account will fail until a workspace admin reconnects it.`}
        </Banner>
      ) : null}

      {account.health === "inactive" ? (
        <Banner
          tier="blocking"
          title="Paused: over your plan's account limit."
          actions={
            canManage && canAccessBilling ? (
              <Button asChild size="sm">
                <Link href={billingHref}>Upgrade</Link>
              </Button>
            ) : undefined
          }
        >
          {accountLimitMax != null
            ? `Your plan includes ${accountLimitMax} account${accountLimitMax === 1 ? "" : "s"}. `
            : ""}
          {canManage
            ? canAccessBilling
              ? "Upgrade, or disconnect another account to use this one."
              : "Ask the workspace owner to upgrade, or disconnect another account to use this one."
            : "Ask a workspace admin to free up a slot."}
        </Banner>
      ) : null}

      <Section title="Connection">
        <Row label="Network">
          <span className="inline-flex items-center gap-1.5">
            <NetworkIcon network={account.platform} size={14} label="" />
            {network}
          </span>
        </Row>
        {account.platform === "instagram" ? (
          <Row label="Connected with">
            {account.connectionMethod === "facebook-page"
              ? "A Facebook Page"
              : "Instagram login"}
          </Row>
        ) : null}
        <Row label="Sign-in">
          {isBluesky
            ? "App password (doesn't expire)"
            : account.health === "expired"
              ? "Expired"
              : "Working"}
        </Row>
        <Row label="Posts through Social0">
          {publications.isLoading ? (
            <Skeleton className="h-4 w-10" />
          ) : publications.isError ? (
            <button
              type="button"
              onClick={() => void publications.refetch()}
              className="text-sm text-text-muted underline underline-offset-2 hover:text-text"
            >
              Couldn't load · Retry
            </button>
          ) : (
            <span className="tabular-nums">{publications.data?.toLocaleString()}</span>
          )}
        </Row>
        {canManage && account.health === "healthy" && !isBluesky ? (
          <div className="pt-1">
            <Button asChild variant="outline" size="sm">
              <a href={account.reconnectHref}>
                <RefreshCw aria-hidden />
                Refresh sign-in
              </a>
            </Button>
            <p className="mt-1.5 text-xs text-text-muted">
              Signs in to {network} again to renew access. Use it if posts fail with a
              permission error.
            </p>
          </div>
        ) : null}
        {canManage && isBluesky ? (
          <div className="pt-1">
            <Button variant="outline" size="sm" onClick={() => onUpdateBlueskyPassword(account)}>
              <KeyRound aria-hidden />
              Update app password
            </Button>
            <p className="mt-1.5 text-xs text-text-muted">
              Use this if you revoked the app password in Bluesky.
            </p>
          </div>
        ) : null}
      </Section>

      {canManage ? (
        <Section title="Picture">
          <p className="text-xs text-text-muted">
            Shown for this account across Social0. Reconnecting may bring back the
            picture from {network}.
          </p>
          <AvatarEditor
            currentUrl={account.profileImageUrl ?? null}
            displayLabel={accountTitle(account)}
            subject="this account's picture"
            onSave={async (url) => {
              const result = await updateConnectionAvatar(account.id, url);
              if (!result.error) onAccountsChanged();
              return result;
            }}
          />
        </Section>
      ) : null}

      {account.platform === "pinterest" ? (
        <Section title="Pinterest">
          <PinterestBoardSetting
            accountId={account.id}
            defaultBoardId={
              metadata === undefined ? undefined : pinterestDefaultBoardId(metadata ?? undefined)
            }
            canManage={canManage && account.health !== "inactive"}
          />
        </Section>
      ) : null}

      {account.platform === "twitter_x" ? (
        <Section title="X">
          <Row label="X Premium">
            <span className="inline-flex items-center gap-1.5">
              {account.isTwitterPremium ? (
                <Crown className="size-3.5 text-warning" aria-hidden />
              ) : null}
              {account.isTwitterPremium ? "Yes" : "No"}
            </span>
          </Row>
          <p className="text-xs text-text-muted">
            Premium accounts can post up to 25,000 characters; others up to 280.
          </p>
          {canManage ? (
            <div className="space-y-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void recheckPremium()}
                disabled={premiumPending}
              >
                {premiumPending ? (
                  <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Crown aria-hidden />
                )}
                {premiumPending ? "Checking…" : "Recheck Premium status"}
              </Button>
              <p className="text-xs text-text-muted">Checks every X account in this workspace.</p>
              {premiumError ? (
                <p role="alert" className="text-sm text-danger">
                  {premiumError}
                </p>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {account.platform === "tiktok" ? (
        <Section title="TikTok">
          <p className="text-sm text-text-muted">
            TikTok asks you to choose who can view each post and whether comments,
            duets and stitches are on, every time you post. Social0 shows those
            choices in the composer for each TikTok post, so there are no saved
            defaults here.
          </p>
        </Section>
      ) : null}

      {account.platform === "instagram" ? (
        <Section title="Instagram">
          <p className="text-sm text-text-muted">
            {account.connectionMethod === "facebook-page"
              ? "Connected through the Facebook Page this Instagram account is linked to. Reconnecting signs in with Facebook again."
              : "Connected with Instagram login. Reconnecting signs in to Instagram again."}
          </p>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-medium text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text">{children}</span>
    </div>
  );
}
