import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, PanelRightClose } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { NetworkIcon, networkLabel } from "@/components/app";
import { loadCalendarPageData } from "@/api/dashboard-data";
import { getLimitForAccount } from "@/lib/platform-limits";
import { cn } from "@/lib/utils";
import { captionFor, captionForAccount, type NetworkSummary } from "./rules";
import { publishableParts } from "./payload";
import { safeTimezone, wallParts } from "./nl-time";
import type {
  ComposerAccount,
  ComposerContentType,
  ComposerDraft,
  ComposerIssue,
  ComposerMedia,
} from "./types";

const MEDIA_SHOWN: Record<string, number> = {
  twitter_x: 4,
  bluesky: 4,
  threads: 4,
  pinterest: 1,
  tiktok: 1,
  youtube: 1,
};

type Props = {
  draft: ComposerDraft;
  selected: ComposerAccount[];
  type: ComposerContentType;
  networks: NetworkSummary[];
  issues: ComposerIssue[];
  /** When the post goes out (picked time or next slot), for the calendar view. */
  targetAt: Date | null;
  timezone: string;
  use24h: boolean;
  onCollapse: () => void;
  onPostWithout: (network: string) => void;
};

/**
 * Right rail: per-network preview (tabs by network) and a Calendar view of
 * the week around when this post goes out.
 */
export function PreviewRail(props: Props) {
  const [view, setView] = useState<"preview" | "calendar">("preview");
  const [tab, setTab] = useState<string | null>(null);
  const networks = props.networks.map((n) => n.network);
  const active = tab && networks.includes(tab) ? tab : (networks[0] ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-bg p-0.5" role="tablist" aria-label="Preview or calendar">
          {(["preview", "calendar"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === v ? "bg-bg-elevated text-text shadow-sm" : "text-text-muted hover:text-text",
              )}
            >
              {v === "preview" ? "Preview" : "Calendar"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {view === "preview"
            ? networks.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTab(n)}
                  aria-pressed={active === n}
                  aria-label={`Preview on ${networkLabel(n)}`}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-md transition-colors",
                    active === n ? "bg-bg-elevated ring-1 ring-border" : "opacity-60 hover:opacity-100",
                  )}
                >
                  <NetworkIcon network={n} size={14} label="" />
                </button>
              ))
            : null}
          <button
            type="button"
            onClick={props.onCollapse}
            aria-label="Hide preview"
            title="Hide preview"
            className="ml-1 hidden size-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-muted hover:text-text lg:inline-flex"
          >
            <PanelRightClose className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "preview" ? (
          active ? (
            <NetworkPreview {...props} network={active} />
          ) : (
            <p className="px-1 text-xs text-text-muted">Add an account to see the preview.</p>
          )
        ) : (
          <WeekView targetAt={props.targetAt} timezone={props.timezone} use24h={props.use24h} />
        )}
      </div>
    </div>
  );
}

function NetworkPreview({
  draft,
  selected,
  type,
  issues,
  network,
  onPostWithout,
}: Props & { network: string }) {
  const account = selected.find((a) => a.platform === network);
  const netIssues = issues.filter(
    (i) => i.network === network && i.accountIds.length > 0,
  );
  const isThread = type === "threads";
  const parts = isThread ? publishableParts(draft) : [draft.parts[0]!];
  const limit = account ? getLimitForAccount(account) : null;
  const handle = account?.platformUsername?.trim() || networkLabel(network);

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl border border-border bg-bg-elevated p-3 text-[13px] leading-relaxed text-text">
        {parts.map((part, i) => {
          const raw = isThread
            ? part.text
            : account
              ? captionForAccount(draft, account)
              : captionFor(draft, network);
          const text = raw.trim();
          const cut = limit != null && text.length > limit ? limit : null;
          const shown = Math.min(part.media.length, MEDIA_SHOWN[network] ?? 10);
          return (
            <div key={part.id} className={cn("relative flex gap-2.5", i > 0 && "pt-3")}>
              {isThread && i < parts.length - 1 ? (
                <span aria-hidden className="absolute bottom-0 left-[15px] top-10 w-px bg-border" />
              ) : null}
              <AccountAvatar
                profileImageUrl={account?.profileImageUrl}
                username={account?.platformUsername}
                platform={network}
                size="sm"
                className="size-8! shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">
                  <span className="font-semibold">{handle}</span>
                  {network === "twitter_x" && account?.isTwitterPremium ? (
                    <img
                      src="/icons/twitter-premium.svg"
                      alt="Verified"
                      className="ml-0.5 inline-block size-3.5 align-[-2px]"
                    />
                  ) : null}{" "}
                  <span className="text-text-muted">
                    {network === "linkedin" || network === "facebook" ? "· now" : `@${handle.replace(/^@/, "")} · now`}
                  </span>
                </p>
                {text ? (
                  <p className="mt-0.5 whitespace-pre-wrap break-words">
                    {cut ? text.slice(0, cut) : text}
                    {cut ? (
                      <span className="text-text-muted" title="Trimmed to fit">
                        …
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-0.5 italic text-text-muted">
                    {i === 0 ? "Start typing to see the preview." : "Empty post"}
                  </p>
                )}
                {part.media.length > 0 ? (
                  <MediaPreview
                    media={part.media.slice(0, Math.max(1, shown))}
                    total={part.media.length}
                    network={network}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {netIssues.map((issue) => (
        <div
          key={issue.id}
          className="flex items-start gap-2 px-1 text-xs text-text"
          role="note"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1">
            {issue.message}{" "}
            <button
              type="button"
              onClick={() => onPostWithout(network)}
              className="font-medium text-accent hover:text-accent-hover"
            >
              Post without {networkLabel(network)}
            </button>
          </span>
        </div>
      ))}
      <p className="px-1 text-xs text-text-muted">
        Previews are close, not exact. Networks may crop differently.
      </p>
    </div>
  );
}

function MediaPreview({
  media,
  total,
  network,
}: {
  media: ComposerMedia[];
  total: number;
  network: string;
}) {
  const vertical = network === "tiktok" || network === "instagram";
  if (media.length === 1 || network === "instagram") {
    const m = media[0]!;
    return (
      <div className="relative mt-2 overflow-hidden rounded-lg border border-border bg-bg-muted">
        <Thumb m={m} className={cn("w-full object-cover", vertical ? "max-h-72" : "max-h-56")} />
        {total > 1 && network === "instagram" ? (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-1.5 text-[11px] font-medium text-white">
            1/{Math.min(total, 10)}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className={cn("mt-2 grid gap-0.5 overflow-hidden rounded-lg border border-border", "grid-cols-2")}>
      {media.map((m, i) => (
        <Thumb
          key={m.id}
          m={m}
          className={cn(
            "h-28 w-full object-cover",
            media.length === 3 && i === 0 && "row-span-2 h-full",
          )}
        />
      ))}
    </div>
  );
}

function Thumb({ m, className }: { m: ComposerMedia; className?: string }) {
  if (m.kind === "image") return <img src={m.previewUrl} alt="" className={className} />;
  return (
    <video
      src={m.previewUrl}
      poster={m.posterUrl}
      muted
      playsInline
      controls
      preload="metadata"
      className={className}
    />
  );
}

function WeekView({
  targetAt,
  timezone,
  use24h,
}: {
  targetAt: Date | null;
  timezone: string;
  use24h: boolean;
}) {
  const tz = safeTimezone(timezone);
  const query = useQuery({
    queryKey: ["calendar-page"],
    queryFn: loadCalendarPageData,
    staleTime: 60_000,
  });
  const start = useMemo(() => {
    const p = wallParts(targetAt ?? new Date(), tz);
    return new Date(p.year, p.month, p.day);
  }, [targetAt, tz]);

  if (query.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-bg-muted motion-reduce:animate-none" aria-busy />;
  }
  if (query.isError || (query.data && !query.data.ok)) {
    return (
      <p className="text-xs text-danger" role="alert">
        Couldn&apos;t load your calendar.{" "}
        <button type="button" onClick={() => void query.refetch()} className="font-medium text-accent">
          Retry
        </button>
      </p>
    );
  }
  const posts = query.data && query.data.ok ? query.data.data.posts : [];
  const clock = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: use24h ? "2-digit" : "numeric",
      minute: "2-digit",
      hour12: !use24h,
    }).format(d);

  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <ol className="divide-y divide-border">
      {days.map((day) => {
        const items = posts
          .map((p) => ({ p, at: new Date(p.scheduledAt ?? p.displayDate) }))
          .filter(({ at }) => {
            const w = wallParts(at, tz);
            return w.year === day.getFullYear() && w.month === day.getMonth() && w.day === day.getDate();
          })
          .sort((a, b) => a.at.getTime() - b.at.getTime());
        const mine =
          targetAt &&
          (() => {
            const w = wallParts(targetAt, tz);
            return w.year === day.getFullYear() && w.month === day.getMonth() && w.day === day.getDate();
          })();
        return (
          <li key={day.toISOString()} className="px-1 py-2 first:pt-0">
            <p className="mb-1 text-xs font-medium text-text-muted">
              {day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            {items.length === 0 && !mine ? (
              <p className="text-xs text-text-subtle">Nothing scheduled</p>
            ) : null}
            <ul className="space-y-1">
              {mine && targetAt ? (
                <li className="-mx-1 flex items-center gap-1.5 rounded-md bg-accent/10 px-1 py-0.5 text-xs font-medium text-text">
                  <span className="tabular-nums">{clock(targetAt)}</span>
                  <span>This post</span>
                </li>
              ) : null}
              {items.slice(0, 6).map(({ p, at }) => (
                <li key={p.id} className={cn("flex items-center gap-1.5 text-xs text-text", p.status === "draft" && "opacity-70")}>
                  <span className="w-14 shrink-0 tabular-nums text-text-muted">{clock(at)}</span>
                  {p.platform ? <NetworkIcon network={p.platform} size={11} label="" /> : null}
                  <span className="min-w-0 truncate">{p.snippet || "Untitled"}</span>
                </li>
              ))}
              {items.length > 6 ? (
                <li className="text-xs text-text-muted">+{items.length - 6} more</li>
              ) : null}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
