import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { SourceChipView, isSelfSource, type PostSourceInfo } from "@/components/app";
import { listWorkspaces } from "@/api/team";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { formatFull, type TimeOpts } from "./posts-model";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] text-text">{children}</dd>
    </div>
  );
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(id)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => toast.error("Couldn't copy. Select the ID and copy it instead."));
      }}
      className="inline-flex max-w-full items-center gap-1 rounded font-mono text-[11px] text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      aria-label={copied ? "Post ID copied" : "Copy post ID"}
      title={id}
    >
      <span className="truncate">{id.slice(0, 8)}…</span>
      {copied ? <Check className="size-3 shrink-0 text-ok" aria-hidden /> : <Copy className="size-3 shrink-0" aria-hidden />}
    </button>
  );
}

export type AutomationSummary = string[];

/**
 * Properties (mock 06·A): schedule, source, workspace, type, automations and
 * the post id (for the API / CLI). Status lives in the page header only, and
 * Source only shows when someone other than you created the post.
 */
export function PostProperties({
  postId,
  scheduledAt,
  isQueued,
  publishedAt,
  createdAt,
  source,
  displayType,
  automations,
  timeOpts,
}: {
  postId: string;
  scheduledAt: Date | null;
  isQueued: boolean;
  publishedAt: Date | null;
  createdAt: Date | null;
  source: PostSourceInfo;
  displayType: string;
  automations: AutomationSummary;
  timeOpts: TimeOpts;
}) {
  const workspaces = useQuery({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: listWorkspaces,
    staleTime: 60_000,
  });
  const workspaceName = workspaces.data?.workspaces.find((w) => w.isActive)?.name ?? null;

  return (
    <section aria-labelledby="properties-title" className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
      <h2 id="properties-title" className="sr-only">
        Properties
      </h2>
      <dl className="divide-y divide-border">
        {scheduledAt ? (
          <Row label={isQueued ? "Queued for" : "Scheduled"}>{formatFull(scheduledAt, timeOpts)}</Row>
        ) : null}
        {publishedAt ? <Row label="Published">{formatFull(publishedAt, timeOpts)}</Row> : null}
        {createdAt ? <Row label="Created">{formatFull(createdAt, timeOpts)}</Row> : null}
        {isSelfSource(source) ? null : (
          <Row label="Source">
            <SourceChipView source={source} />
          </Row>
        )}
        {workspaceName ? <Row label="Workspace">{workspaceName}</Row> : null}
        <Row label="Type">{displayType}</Row>
        <Row label="Automations">
          {automations.length > 0 ? (
            <span className="flex flex-col items-end gap-0.5">
              {automations.map((a) => (
                <span key={a}>{a}</span>
              ))}
            </span>
          ) : (
            <span className="text-text-muted">None</span>
          )}
        </Row>
        <Row label="Post ID">
          <CopyId id={postId} />
        </Row>
      </dl>
    </section>
  );
}
