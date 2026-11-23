import { formatDistanceToNowStrict } from "date-fns";
import { useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { Banner, useAccountHealth, useDashboardPath } from "@/components/app";
import { reconnectUrl } from "@/lib/account-reconnect";
import { PLATFORM_LABEL } from "@/lib/platforms";
import type { InboxFetchError, InboxNotice, InboxReconnectHint } from "@/api/inbox";

type Meta = {
  reconnect: InboxReconnectHint[];
  notices: InboxNotice[];
  fetchErrors: InboxFetchError[];
  unsupported: string[];
};

function label(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * Inbox-specific problems from the live reads: accounts that need a
 * reconnect (missing inbox permissions), per-account fetch errors (with
 * Retry), platform notices and networks without comment/DM support.
 *
 * Plain expired sign-ins are left to the shell's reconnect banner so the
 * same problem isn't announced twice.
 */
export function InboxStatusBanners({
  comments,
  dms,
  onRetry,
  retrying,
}: {
  comments: Meta | null;
  dms: Meta | null;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const dash = useDashboardPath();
  const { accounts, broken, canManageConnections } = useAccountHealth();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const hide = (key: string) => setDismissed((prev) => new Set(prev).add(key));

  const reconnect = useMemo(() => {
    const brokenIds = new Set(broken.map((a) => a.id));
    const seen = new Map<string, InboxReconnectHint>();
    for (const hint of [...(comments?.reconnect ?? []), ...(dms?.reconnect ?? [])]) {
      const onlyExpired =
        hint.missingScopes.length > 0 &&
        hint.missingScopes.every((s) => s === "token_expired");
      if (onlyExpired && brokenIds.has(hint.accountId)) continue;
      if (!seen.has(hint.accountId)) seen.set(hint.accountId, hint);
    }
    return [...seen.values()];
  }, [broken, comments?.reconnect, dms?.reconnect]);

  const notices = useMemo(() => {
    const seen = new Map<string, InboxNotice>();
    for (const n of [...(comments?.notices ?? []), ...(dms?.notices ?? [])]) {
      seen.set(`${n.platform}:${n.message}`, n);
    }
    return [...seen.entries()].filter(([k]) => !dismissed.has(`notice:${k}`));
  }, [comments?.notices, dms?.notices, dismissed]);

  const fetchErrors = useMemo(() => {
    const seen = new Map<string, InboxFetchError>();
    for (const e of [...(comments?.fetchErrors ?? []), ...(dms?.fetchErrors ?? [])]) {
      seen.set(`${e.accountId}:${e.error}`, e);
    }
    return [...seen.values()];
  }, [comments?.fetchErrors, dms?.fetchErrors]);

  const unsupportedComments = [...new Set(comments?.unsupported ?? [])].map(label);
  const unsupportedDms = [...new Set(dms?.unsupported ?? [])].map(label);

  const reconnectHref = (hint: InboxReconnectHint) =>
    accounts.find((a) => a.id === hint.accountId)?.reconnectHref ??
    reconnectUrl({ id: hint.accountId, platform: hint.platform });


  const errorsKey = `errors:${fetchErrors.map((e) => `${e.accountId}:${e.error}`).join("|")}`;
  const showErrors = fetchErrors.length > 0 && !dismissed.has(errorsKey);
  const reconnectKey = `reconnect:${reconnect.map((r) => r.accountId).join("|")}`;
  const unsupportedKey = `unsupported:${unsupportedComments.join()}|${unsupportedDms.join()}`;
  const showUnsupported =
    (unsupportedComments.length > 0 || unsupportedDms.length > 0) &&
    !dismissed.has(unsupportedKey);

  const showReconnect = reconnect.length > 0 && !dismissed.has(reconnectKey);

  if (!showReconnect && !showErrors && !notices.length && !showUnsupported) return null;

  return (
    <div className="flex flex-col gap-2">
      {showReconnect ? (
        <Banner
          tier="blocking"
          title={
            reconnect.length === 1
              ? `Reconnect ${label(reconnect[0]!.platform)}${reconnect[0]!.username ? ` (@${reconnect[0]!.username.replace(/^@/, "")})` : ""} to see everything here.`
              : "Reconnect these accounts to see everything here."
          }
          onDismiss={() => hide(reconnectKey)}
          actions={
            canManageConnections && reconnect.length === 1 ? (
              <a
                href={reconnectHref(reconnect[0]!)}
                className="inline-flex h-8 items-center rounded-lg bg-text px-3 text-[13px] font-semibold text-bg hover:opacity-90"
              >
                Reconnect
              </a>
            ) : (
              <Link
                href={dash("connections")}
                className="inline-flex h-8 items-center rounded-lg border border-border bg-bg-elevated px-3 text-[13px] font-medium text-text hover:bg-bg-muted"
              >
                Open Accounts
              </Link>
            )
          }
        >
          {reconnect.length > 1 ? (
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {reconnect.map((a) =>
                canManageConnections ? (
                  <a
                    key={a.accountId}
                    href={reconnectHref(a)}
                    className="font-medium text-text underline underline-offset-2 hover:no-underline"
                  >
                    {label(a.platform)}
                    {a.username ? ` @${a.username.replace(/^@/, "")}` : ""}
                  </a>
                ) : (
                  <span key={a.accountId}>
                    {label(a.platform)}
                    {a.username ? ` @${a.username.replace(/^@/, "")}` : ""}
                  </span>
                ),
              )}
            </span>
          ) : (
            <span className="text-text-muted">
              {canManageConnections
                ? "Social0 is missing permission to read its comments or messages."
                : "Social0 is missing permission to read its comments or messages. Ask a workspace admin to reconnect it."}
            </span>
          )}
        </Banner>
      ) : null}

      {showErrors ? (
        <Banner
          tier="danger"
          title={
            fetchErrors.length === 1
              ? `Couldn't load ${label(fetchErrors[0]!.platform)}.`
              : `Couldn't load ${fetchErrors.length} accounts.`
          }
          onDismiss={() => hide(errorsKey)}
          actions={
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex h-8 items-center rounded-lg border border-border bg-bg-elevated px-3 text-[13px] font-medium text-text hover:bg-bg-muted disabled:opacity-60"
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          }
        >
          <span className="text-text-muted">
            {fetchErrors.map((e) => `${label(e.platform)}: ${e.error}`).join(" · ")}
          </span>
        </Banner>
      ) : null}

      {notices.map(([key, n]) =>
        n.kind === "stale" ? (
          // Saved data is the normal path for X's tiny quotas: say it quietly.
          <p key={key} className="text-xs text-text-muted">
            {label(n.platform)}: showing what we saved
            {n.cachedAt
              ? ` ${formatDistanceToNowStrict(new Date(n.cachedAt), { addSuffix: true })}`
              : ""}
            . Newer replies show up on their own.
          </p>
        ) : (
          <Banner key={key} tier="info" onDismiss={() => hide(`notice:${key}`)}>
            {label(n.platform)}: {n.message}
          </Banner>
        ),
      )}

      {showUnsupported ? (
        <Banner tier="info" onDismiss={() => hide(unsupportedKey)}>
          {[
            unsupportedComments.length
              ? `Comments aren't available yet for ${list(unsupportedComments)}.`
              : null,
            unsupportedDms.length
              ? `DMs aren't available yet for ${list(unsupportedDms)}.`
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
        </Banner>
      ) : null}
    </div>
  );
}
