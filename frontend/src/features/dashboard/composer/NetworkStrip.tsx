import { RotateCcw } from "lucide-react";
import { NetworkIcon, networkLabel } from "@/components/app";
import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import { cn } from "@/lib/utils";
import type { NetworkSummary } from "./rules";

type Props = {
  networks: NetworkSummary[];
  /** False on an empty composer: counters stay neutral until there is content. */
  showProblems?: boolean;
  overrides: Record<string, string>;
  mainText: string;
  /** Overrides don't apply to threads (each post has its own text). */
  allowOverrides: boolean;
  onStartOverride: (network: string) => void;
  onChangeOverride: (network: string, text: string) => void;
  onClearOverride: (network: string) => void;
  /** Restored per-account captions (see `ComposerDraft.accountCaptions`). */
  accountCaptions?: Record<string, string>;
  onChangeAccountCaption: (accountId: string, text: string) => void;
  /** Collapse a network's per-account captions into one (the first account's). */
  onUseOneCaption: (network: string) => void;
};

const STATE_CLASS: Record<NetworkSummary["state"], string> = {
  ok: "text-text-muted",
  near: "text-warning",
  over: "text-warning",
  blocked: "text-warning",
};

/**
 * One quiet counter per selected network: characters used / limit, or what
 * it still needs ("needs media"). "Edit caption for…" forks a per-network
 * caption, marked with a dot on its counter. A saved post whose accounts on
 * one network had different captions keeps one caption box per account.
 */
export function NetworkStrip({
  networks,
  showProblems = true,
  overrides,
  mainText,
  allowOverrides,
  onStartOverride,
  onChangeOverride,
  onClearOverride,
  accountCaptions = {},
  onChangeAccountCaption,
  onUseOneCaption,
}: Props) {
  if (networks.length === 0) return null;
  const isSplit = (n: NetworkSummary) =>
    n.accounts.some((a) => accountCaptions[a.id] != null);
  const isCustom = (n: NetworkSummary) => overrides[n.network] != null || isSplit(n);
  const canFork = allowOverrides && networks.length >= 2;
  const overridden = allowOverrides ? networks.filter(isCustom) : [];
  const forkable = networks.filter((n) => !isCustom(n));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1" aria-label="Per network">
        {networks.map((n) => (
          <span
            key={n.network}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 text-xs tabular-nums",
              STATE_CLASS[showProblems ? n.state : "ok"],
            )}
            title={
              n.state === "over"
                ? `${networkLabel(n.network)}: over by ${n.count - n.limit}. We'll trim it.`
                : n.note && showProblems
                  ? `${networkLabel(n.network)}: ${n.note}`
                  : `${networkLabel(n.network)}: ${n.count} of ${n.limit} characters`
            }
          >
            <NetworkIcon network={n.network} size={12} label="" />
            <span className="sr-only">{networkLabel(n.network)}: </span>
            {(showProblems ? n.note : null) ?? `${n.count.toLocaleString()}/${n.limit.toLocaleString()}`}
            {n.overridden ? (
              <span
                className="size-1.5 rounded-full bg-accent"
                aria-label="custom caption"
                role="img"
              />
            ) : null}
          </span>
        ))}
        {canFork && forkable.length > 0 ? (
          forkable.length === 1 ? (
            <button
              type="button"
              onClick={() => onStartOverride(forkable[0]!.network)}
              className="ml-auto h-6 rounded-md px-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Edit caption for {networkLabel(forkable[0]!.network)}
            </button>
          ) : (
            <select
              aria-label="Edit caption for one network"
              value=""
              onChange={(e) => e.target.value && onStartOverride(e.target.value)}
              className="ml-auto h-6 cursor-pointer rounded-md bg-transparent px-1 text-xs font-medium text-text-muted hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <option value="">Edit caption for…</option>
              {forkable.map((n) => (
                <option key={n.network} value={n.network}>
                  {networkLabel(n.network)}
                </option>
              ))}
            </select>
          )
        ) : null}
      </div>

      {overridden.map((n) => {
        if (isSplit(n)) {
          const label = networkLabel(n.network);
          return (
            <div
              key={`override-${n.network}`}
              className="space-y-2 rounded-xl border border-border bg-bg-subtle p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text">
                  <NetworkIcon network={n.network} size={12} label="" />
                  Captions for {label}
                  <span className="font-normal text-text-muted">· different per account</span>
                </span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onUseOneCaption(n.network)}
                    title={`Use the first caption for every ${label} account. The others are replaced.`}
                    className="text-xs font-medium text-text-muted hover:text-text"
                  >
                    Use one caption
                  </button>
                  <button
                    type="button"
                    onClick={() => onClearOverride(n.network)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
                  >
                    <RotateCcw className="size-3" aria-hidden />
                    Use main caption
                  </button>
                </span>
              </div>
              <p className="text-xs text-text-muted">
                This post had a different caption for each {label} account. Each one keeps its own.
              </p>
              {n.accounts.map((a) => {
                const value = accountCaptions[a.id] ?? overrides[n.network] ?? mainText;
                const over = value.trim().length > n.limit;
                const handle = a.platformUsername?.trim() || label;
                return (
                  <div key={a.id}>
                    <label
                      htmlFor={`caption-${n.network}-${a.id}`}
                      className="mb-1 block truncate text-xs font-medium text-text-muted"
                    >
                      {handle.startsWith("@") ? handle : `@${handle}`}
                    </label>
                    <AutoResizeTextarea
                      id={`caption-${n.network}-${a.id}`}
                      value={value}
                      onChange={(e) => onChangeAccountCaption(a.id, e.target.value)}
                      rows={2}
                      maxHeight={200}
                      className="w-full rounded-lg border border-input bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                    <p
                      className={cn(
                        "mt-1 text-right text-xs tabular-nums",
                        over ? "text-warning" : "text-text-muted",
                      )}
                      aria-live="polite"
                    >
                      {value.trim().length.toLocaleString()}/{n.limit.toLocaleString()}
                      {over ? " · will be trimmed" : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          );
        }
        const value = overrides[n.network] ?? "";
        const over = value.trim().length > n.limit;
        return (
          <div
            key={`override-${n.network}`}
            className="rounded-xl border border-border bg-bg-subtle p-3"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor={`caption-${n.network}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-text"
              >
                <NetworkIcon network={n.network} size={12} label="" />
                Caption for {networkLabel(n.network)}
              </label>
              <button
                type="button"
                onClick={() => onClearOverride(n.network)}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
              >
                <RotateCcw className="size-3" aria-hidden />
                Use main caption
              </button>
            </div>
            <AutoResizeTextarea
              id={`caption-${n.network}`}
              value={value}
              onChange={(e) => onChangeOverride(n.network, e.target.value)}
              placeholder={mainText || "Caption for this network"}
              rows={2}
              maxHeight={200}
              className="w-full rounded-lg border border-input bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <p
              className={cn(
                "mt-1 text-right text-xs tabular-nums",
                over ? "text-warning" : "text-text-muted",
              )}
              aria-live="polite"
            >
              {value.trim().length.toLocaleString()}/{n.limit.toLocaleString()}
              {over ? " · will be trimmed" : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}
