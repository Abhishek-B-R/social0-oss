import { useMemo, useState, type ReactNode } from "react";
import { isSelfSource, networkLabel, SourceChipView, type PostSourceInfo } from "@/components/app";
import { cn } from "@/lib/utils";
import {
  displayError,
  formatFull,
  type ListPublication,
  type TimeOpts,
} from "./posts-model";

export type TimelineEvent = {
  id: string;
  phase: string;
  platform: string | null;
  message: string | null;
  createdAt: string;
};

type Tone = "ok" | "danger" | "neutral" | "upcoming" | "agent";

type Entry = {
  key: string;
  at: Date | null;
  tone: Tone;
  body: ReactNode;
};

const DOT: Record<Tone, string> = {
  ok: "bg-ok",
  danger: "bg-danger",
  neutral: "bg-text-subtle",
  agent: "bg-agent",
  upcoming: "border-2 border-text-subtle bg-bg-elevated",
};

function toneForPhase(phase: string): Tone {
  const p = phase.toLowerCase();
  if (p.includes("fail") || p.includes("error") || p.includes("expired")) return "danger";
  if (p.includes("success") || p.includes("done") || p.includes("triggered") || p.includes("published")) return "ok";
  return "neutral";
}

const PHASE_COPY: Record<string, string> = {
  queued: "Publish started",
  fan_out: "Sent to each network",
  platform_queued: "Waiting its turn",
  platform_uploading: "Uploading",
  platform_success: "Published",
  platform_failed: "Failed",
  resurface_done: "Auto-Repost ran",
  resurface_failed: "Auto-Repost failed",
  autoplug_watching: "Auto-Plug is watching",
  autoplug_triggered: "Auto-Plug comment posted",
  autoplug_failed: "Auto-Plug failed",
  autoplug_expired: "Auto-Plug window ended",
};

function phaseText(ev: TimelineEvent): string {
  const base = PHASE_COPY[ev.phase] ?? ev.phase.replace(/_/g, " ");
  const msg = ev.message?.trim();
  const network = ev.platform ? networkLabel(ev.platform) : null;
  const lead = network ? `${network}: ` : "";
  if (msg) {
    const shown = ev.platform ? (displayError(ev.platform, msg) ?? msg) : msg;
    return `${lead}${shown}`;
  }
  return `${lead}${base.charAt(0).toUpperCase()}${base.slice(1)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const totalSec = Math.round(sec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

/**
 * How long the latest publish attempt took: from its start ("queued", else
 * "fan_out") to the last network result after it. Events span every attempt
 * (first try, retries, Publish now after a failed schedule), so measuring
 * across all of them would report a next-day retry as a day-long publish.
 */
function latestAttemptMs(publishEvents: TimelineEvent[]): number | null {
  const timed = publishEvents
    .map((e) => ({ phase: e.phase, t: new Date(e.createdAt).getTime() }))
    .filter((e) => !Number.isNaN(e.t))
    .sort((a, b) => a.t - b.t);
  if (timed.length < 2) return null;
  const lastTime = (match: (e: (typeof timed)[number]) => boolean) => {
    for (let i = timed.length - 1; i >= 0; i--) if (match(timed[i]!)) return timed[i]!.t;
    return null;
  };
  const start =
    lastTime((e) => e.phase === "queued") ?? lastTime((e) => e.phase === "fan_out") ?? timed[0]!.t;
  const end = lastTime(
    (e) => e.t >= start && (e.phase === "platform_success" || e.phase === "platform_failed"),
  );
  return end == null ? null : end - start;
}

const COLLAPSED_COUNT = 6;

/**
 * Activity (mock 06·A): who created the post, when it was scheduled or
 * queued, and what each network said, from the existing publish job events.
 * Falls back to publication rows for posts published before events existed.
 */
export function ActivityTimeline({
  source,
  isAgentDraft,
  createdAt,
  status,
  scheduledAt,
  isQueued,
  publications,
  events,
  timeOpts,
}: {
  source: PostSourceInfo;
  isAgentDraft: boolean;
  createdAt: Date | null;
  status: string;
  scheduledAt: Date | null;
  isQueued: boolean;
  publications: ListPublication[];
  events: TimelineEvent[];
  timeOpts: TimeOpts;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now] = useState(() => Date.now());

  const { entries, duration } = useMemo(() => {
    const list: Entry[] = [];
    list.push({
      key: "created",
      at: createdAt,
      tone: source.isAgent ? "agent" : "neutral",
      body: (
        <>
          {isSelfSource(source) ? (
            "You "
          ) : (
            <SourceChipView source={source} className="mr-1 align-middle" />
          )}
          created this post{status === "draft" ? " as a draft" : ""}
          {isAgentDraft ? ". It's waiting for your review." : ""}
        </>
      ),
    });

    const publishEvents = events.filter(
      (e) => !e.phase.startsWith("resurface_") && !e.phase.startsWith("autoplug_"),
    );
    for (const ev of events) {
      const at = new Date(ev.createdAt);
      list.push({
        key: ev.id,
        at: Number.isNaN(at.getTime()) ? null : at,
        tone: toneForPhase(ev.phase),
        body: phaseText(ev),
      });
    }

    if (publishEvents.length === 0) {
      // Older posts: build the story from the publication rows.
      for (const p of publications) {
        if (p.status === "published") {
          list.push({
            key: `pub-${p.publicationId}`,
            at: p.publishedAt,
            tone: "ok",
            body: `Published to ${networkLabel(p.platform)}${p.platformUsername ? ` (@${p.platformUsername.replace(/^@/, "")})` : ""}`,
          });
        } else if (p.status === "failed") {
          const err = displayError(p.platform, p.lastError);
          list.push({
            key: `fail-${p.publicationId}`,
            at: null,
            tone: "danger",
            body: `${networkLabel(p.platform)} failed${err ? `: ${err}` : ""}`,
          });
        }
      }
    }

    if ((status === "scheduled" || status === "draft") && scheduledAt && scheduledAt.getTime() > now) {
      list.push({
        key: "upcoming",
        at: scheduledAt,
        tone: "upcoming",
        body: `${isQueued ? "Queued to go out" : "Scheduled to go out"} ${formatFull(scheduledAt, timeOpts)}`,
      });
    }

    // "Created" first, then time order; undated failures (legacy rows) last.
    const [created, ...rest] = list;
    const ordered = [
      created!,
      ...rest.filter((e) => e.at).sort((a, b) => a.at!.getTime() - b.at!.getTime()),
      ...rest.filter((e) => !e.at),
    ];

    const ms = latestAttemptMs(publishEvents);
    const dur = ms == null ? null : formatDuration(ms);
    return { entries: ordered, duration: dur };
  }, [createdAt, events, isAgentDraft, isQueued, now, publications, scheduledAt, source, status, timeOpts]);

  const collapsible = entries.length > COLLAPSED_COUNT + 2;
  const shown =
    collapsible && !expanded
      ? [entries[0]!, ...entries.slice(entries.length - COLLAPSED_COUNT)]
      : entries;
  const hiddenCount = entries.length - shown.length;

  return (
    <section aria-labelledby="activity-title" className="rounded-xl border border-border bg-bg-elevated p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="activity-title" className="text-sm font-semibold text-text">
          Activity
        </h2>
        {duration ? <span className="text-xs text-text-muted">Publishing took {duration}</span> : null}
      </div>
      <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-border">
        {shown.map((e, i) => (
          <li key={e.key} className="relative grid grid-cols-[12px_minmax(0,1fr)] gap-x-3">
            <span
              aria-hidden
              className={cn("relative z-[1] mt-1.5 size-[11px] rounded-full ring-4 ring-bg-elevated", DOT[e.tone])}
            />
            <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <p
                className={cn(
                  "min-w-0 break-words text-[13px] leading-snug",
                  e.tone === "danger" ? "text-danger" : e.tone === "upcoming" ? "text-text-muted" : "text-text",
                )}
              >
                {e.body}
              </p>
              {e.at ? (
                <time dateTime={e.at.toISOString()} className="shrink-0 whitespace-nowrap text-xs tabular-nums text-text-muted">
                  {formatFull(e.at, timeOpts)}
                </time>
              ) : null}
            </div>
            {collapsible && !expanded && i === 0 ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="col-start-2 mt-2 w-fit text-xs font-medium text-text-muted underline-offset-2 hover:text-text hover:underline"
              >
                Show {hiddenCount} earlier {hiddenCount === 1 ? "event" : "events"}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {collapsible && expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-3 text-xs font-medium text-text-muted underline-offset-2 hover:text-text hover:underline"
        >
          Show less
        </button>
      ) : null}
    </section>
  );
}
