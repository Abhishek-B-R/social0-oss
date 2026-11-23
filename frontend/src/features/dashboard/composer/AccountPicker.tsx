import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Plus, Search } from "lucide-react";
import Link from "@/components/AppLink";
import { AccountAvatar } from "@/components/AccountAvatar";
import { NetworkIcon, networkLabel, Toggle } from "@/components/app";
import { getPlanLimits, type SubscriptionTier } from "@/lib/plans";
import { reconnectUrl } from "@/lib/account-reconnect";
import { cn } from "@/lib/utils";
import { Popover } from "./Popover";
import type { ComposerAccount } from "./types";

const INLINE_MAX = 12;

function handle(a: ComposerAccount): string {
  const n = a.platformUsername?.trim();
  if (!n) return networkLabel(a.platform);
  return a.platform === "tiktok" && /\s/.test(n) ? n : `@${n}`;
}

type Props = {
  accounts: ComposerAccount[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  onSetSelection: (ids: string[]) => void;
  remember: boolean;
  onRememberChange: (on: boolean) => void;
  /** Account id → why it can't take this post (shown on the chip). */
  problems: Record<string, string>;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  tier: SubscriptionTier;
  connectHref: string;
  canManageConnections: boolean;
};

/**
 * "Post to" chips: one per connected account with its network, selected
 * accounts filled. Expired accounts show "reconnect" and can't be picked.
 * Large workspaces get the selected chips plus a searchable list.
 */
export function AccountPicker({
  accounts,
  selectedIds,
  onToggle,
  onSetSelection,
  remember,
  onRememberChange,
  problems,
  loading,
  error,
  onRetry,
  tier,
  connectHref,
  canManageConnections,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const addRef = useRef<HTMLButtonElement>(null);
  const selected = new Set(selectedIds);
  const selectable = accounts.filter((a) => !a.tokenExpired);
  const allSelected = selectable.length > 0 && selectable.every((a) => selected.has(a.id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform.toLowerCase().includes(q) ||
        networkLabel(a.platform).toLowerCase().includes(q),
    );
  }, [accounts, query]);

  if (loading) {
    return (
      <div className="flex flex-wrap gap-1.5" aria-busy aria-label="Loading accounts">
        {[112, 148, 96, 132, 120, 88, 140, 104].map((w, i) => (
          <div
            key={i}
            style={{ width: w }}
            className="h-8 animate-pulse rounded-full bg-bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-danger" role="alert">
        Couldn&apos;t load your accounts.
        <button
          type="button"
          onClick={onRetry}
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Retry
        </button>
      </p>
    );
  }

  if (accounts.length === 0) {
    const free = getPlanLimits("free");
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-bg-subtle px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Connect an account to post</p>
          <p className="text-xs text-text-muted">
            {tier === "free"
              ? `Free includes ${free.maxConnectedAccounts} accounts and ${free.maxFreePosts} posts. You can keep writing; we'll keep your text.`
              : "Connect a social account to this workspace to start publishing."}
          </p>
        </div>
        {canManageConnections ? (
          <Link
            href={connectHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover touch:h-11"
          >
            <Plus className="size-4" aria-hidden />
            Connect account
          </Link>
        ) : (
          <p className="text-xs text-text-muted">Ask a workspace admin to connect one.</p>
        )}
      </div>
    );
  }

  const inline = accounts.length <= INLINE_MAX ? accounts : accounts.filter((a) => selected.has(a.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Post to">
      {inline.map((a) => (
        <AccountChip
          key={a.id}
          account={a}
          selected={selected.has(a.id)}
          problem={problems[a.id]}
          onToggle={() => onToggle(a.id)}
        />
      ))}
      <button
        ref={addRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-text-muted transition-colors hover:border-accent/50 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
      >
        <Plus className="size-3.5" aria-hidden />
        {accounts.length > INLINE_MAX
          ? `${selected.size ? "Edit" : "Pick"} accounts (${accounts.length})`
          : allSelected
            ? "Options"
            : "Add"}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={addRef}
        title="Accounts"
        width={340}
      >
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Search accounts</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts"
              className="h-9 w-full rounded-lg border border-input bg-bg pl-8 pr-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                onSetSelection(allSelected ? [] : selectable.map((a) => a.id))
              }
              className="text-xs font-medium text-accent hover:text-accent-hover"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <Toggle
              checked={remember}
              onCheckedChange={onRememberChange}
              label={<span className="text-xs font-medium">Remember selection</span>}
              className="items-center gap-2"
            />
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto" aria-label="Connected accounts">
            {filtered.map((a) => {
              const on = selected.has(a.id);
              return (
                <li key={a.id}>
                  {a.tokenExpired ? (
                    <a
                      href={reconnectUrl(a)}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-bg-muted"
                    >
                      <Avatar account={a} />
                      <span className="min-w-0 flex-1 truncate text-text-muted">{handle(a)}</span>
                      <span className="text-xs font-medium text-warning">Reconnect</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => onToggle(a.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <Avatar account={a} />
                      <span className="min-w-0 flex-1 truncate text-text">
                        {handle(a)}
                        <span className="text-text-muted"> · {networkLabel(a.platform)}</span>
                      </span>
                      <span
                        className={cn(
                          "inline-flex size-4 items-center justify-center rounded border",
                          on ? "border-accent bg-accent text-accent-foreground" : "border-border",
                        )}
                        aria-hidden
                      >
                        {on ? <Check className="size-3" /> : null}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-text-muted">No accounts match.</li>
            ) : null}
          </ul>
          {canManageConnections ? (
            <Link
              href={connectHref}
              className="flex items-center gap-1.5 border-t border-border pt-2 text-xs font-medium text-accent hover:text-accent-hover"
            >
              <Plus className="size-3.5" aria-hidden />
              Connect another account
            </Link>
          ) : null}
        </div>
      </Popover>
    </div>
  );
}

function Avatar({ account }: { account: ComposerAccount }) {
  return (
    <span className="relative inline-flex shrink-0">
      <AccountAvatar
        profileImageUrl={account.profileImageUrl}
        username={account.platformUsername}
        platform={account.platform}
        size="sm"
        className="size-6!"
      />
      <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-bg-elevated ring-1 ring-border">
        <NetworkIcon network={account.platform} size={9} label="" />
      </span>
    </span>
  );
}

function AccountChip({
  account,
  selected,
  problem,
  onToggle,
}: {
  account: ComposerAccount;
  selected: boolean;
  problem?: string;
  onToggle: () => void;
}) {
  const label = `${handle(account)} on ${networkLabel(account.platform)}`;
  if (account.tokenExpired) {
    return (
      <a
        href={reconnectUrl(account)}
        title={`Sign-in expired. Reconnect ${label}.`}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-warning-border bg-warning-soft pl-1 pr-3 text-xs font-medium text-warning transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
      >
        <Avatar account={account} />
        <span className="max-w-[9rem] truncate">{handle(account)}</span>
        <span aria-hidden>·</span>
        <span>reconnect</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={problem && selected ? `${label}. ${problem}` : label}
      title={problem && selected ? problem : label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border pl-1 pr-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11",
        selected
          ? problem
            ? "border-warning-border bg-warning-soft text-text"
            : "border-accent/50 bg-accent/10 text-text"
          : "border-border bg-bg-elevated text-text-muted opacity-75 hover:opacity-100",
      )}
    >
      <Avatar account={account} />
      <span className="max-w-[9rem] truncate">{handle(account)}</span>
      {selected && problem ? (
        <AlertTriangle className="size-3.5 text-warning" aria-hidden />
      ) : null}
    </button>
  );
}
