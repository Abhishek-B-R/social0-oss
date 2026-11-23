import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import Link from "@/components/AppLink";
import { Banner, EmptyState, FilterChip, useDashboardPath } from "@/components/app";
import { Button } from "@/components/ui/button";
import { hasErrors } from "./bulk-import-model";
import { ModeSwitch } from "./ModeSwitch";
import { QueueSummary } from "./MapStep";
import { ReviewRow } from "./ReviewRow";
import type { BulkImportState, WizardStep } from "./use-bulk-import";

type Filter = "all" | "fix" | "ready";

function importLabel(mode: BulkImportState["mode"], n: number): string {
  const posts = `${n} post${n === 1 ? "" : "s"}`;
  if (mode === "queue") return `Add ${posts} to queue`;
  if (mode === "draft") return `Save ${n} draft${n === 1 ? "" : "s"}`;
  return `Schedule ${posts}`;
}

function doneVerb(mode: BulkImportState["mode"]): string {
  if (mode === "queue") return "added to your queue";
  if (mode === "draft") return "saved as drafts";
  return "scheduled";
}

export function ImportResultBanner({ wiz }: { wiz: BulkImportState }) {
  const dash = useDashboardPath();
  const r = wiz.result;
  if (!r || r.done === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-ok-border bg-ok-soft px-4 py-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
        <p className="text-sm text-text">
          <span className="font-semibold">
            {r.done} post{r.done === 1 ? "" : "s"} {doneVerb(r.mode)}.
          </span>{" "}
          {r.failed > 0
            ? `${r.failed} file${r.failed === 1 ? "" : "s"} didn't make it; they're still below.`
            : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-6 text-sm font-medium sm:pl-0">
        <Link
          href={dash(r.mode === "draft" ? "posts?tab=drafts" : "calendar")}
          className="text-accent hover:underline"
        >
          {r.mode === "draft" ? "Open drafts" : "View calendar"}
        </Link>
        <Link href={dash("posts")} className="text-text-muted hover:text-text hover:underline">
          All posts
        </Link>
      </div>
    </div>
  );
}

export function ReviewStep({
  wiz,
  onBack,
  onGoStep,
}: {
  wiz: BulkImportState;
  onBack: () => void;
  onGoStep: (step: WizardStep) => void;
}) {
  const dash = useDashboardPath();
  const [filter, setFilter] = useState<Filter>("all");
  // Rows with problems start open; the user decides after that.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const r of wiz.pendingRows) {
      if (hasErrors(wiz.issuesByRow.get(r.id) ?? []) || r.status === "failed") open.add(r.id);
    }
    return open;
  });

  const rows = wiz.pendingRows;
  const readyIds = useMemo(() => new Set(wiz.readyRows.map((r) => r.id)), [wiz.readyRows]);
  const fixCount = rows.length - wiz.readyRows.length;
  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "ready" ? readyIds.has(r.id) : !readyIds.has(r.id),
  );
  const importing = wiz.progress !== null;
  const n = wiz.readyRows.length;

  const setRowExpanded = (id: string, open: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="space-y-4 pb-2">
      <ImportResultBanner wiz={wiz} />

      {wiz.globalIssues.map((g) => (
        <Banner
          key={g.code}
          tier={g.severity === "error" ? "blocking" : "info"}
          actions={
            g.action ? (
              g.action.href ? (
                <Link
                  href={dash(g.action.href)}
                  className="inline-flex h-8 items-center rounded-lg border border-border bg-bg-elevated px-3 text-sm font-medium text-text hover:bg-bg-muted"
                >
                  {g.action.label}
                </Link>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (g.action?.retry) g.action.retry();
                    else if (g.action?.step) onGoStep(g.action.step);
                  }}
                >
                  {g.action.label}
                </Button>
              )
            ) : null
          }
        >
          {g.message}
        </Banner>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text">
          <span className="font-semibold">{n} ready</span>
          {fixCount > 0 ? (
            <span className="text-danger"> · {fixCount} need fixing</span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show files">
            <FilterChip selected={filter === "all"} onClick={() => setFilter("all")} count={rows.length}>
              All
            </FilterChip>
            <FilterChip
              selected={filter === "fix"}
              onClick={() => setFilter("fix")}
              count={fixCount}
              tone={fixCount > 0 ? "warning" : "default"}
            >
              Needs fixing
            </FilterChip>
            <FilterChip selected={filter === "ready"} onClick={() => setFilter("ready")} count={n}>
              Ready
            </FilterChip>
          </div>
          <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(new Set(rows.map((r) => r.id)))}
          >
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>
            Collapse all
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          compact
          title={filter === "fix" ? "Nothing to fix" : "No files here"}
          description={filter === "fix" ? "Every file is ready to import." : undefined}
          secondaryAction={{ label: "Show all", onClick: () => setFilter("all") }}
        />
      ) : (
        <ul className="space-y-2" aria-label="Files to import">
          {visible.map((row) => (
            <ReviewRow
              key={row.id}
              row={row}
              issues={wiz.issuesByRow.get(row.id) ?? []}
              selectedAccounts={wiz.selectedAccounts}
              mode={wiz.mode}
              expanded={expanded.has(row.id)}
              disabled={importing}
              onToggleExpanded={() => setRowExpanded(row.id, !expanded.has(row.id))}
              onExpand={() => setRowExpanded(row.id, true)}
              onUpdate={(patch) => wiz.updateRow(row.id, patch)}
              onToggleSkip={(p) => wiz.toggleSkip(row.id, p)}
              onRemove={() => wiz.removeRow(row.id)}
            />
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 border-t border-border bg-bg/95 px-1 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-bg/80">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-xs font-medium text-text-muted">Import as</span>
            <ModeSwitch value={wiz.mode} onChange={wiz.setMode} disabled={importing} />
          </div>
          {wiz.mode === "queue" ? (
            <div className="min-w-0 lg:max-w-sm">
              <QueueSummary wiz={wiz} />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 lg:justify-end">
            <Button variant="outline" onClick={onBack} disabled={importing}>
              Back
            </Button>
            <div className="flex items-center gap-3">
              {fixCount > 0 && n > 0 ? (
                <span className="hidden text-xs text-text-muted sm:inline">
                  {fixCount} file{fixCount === 1 ? "" : "s"} will wait here
                </span>
              ) : null}
              <Button
                onClick={() => void wiz.startImport()}
                disabled={n === 0 || wiz.blockingGlobal || importing}
              >
                {importLabel(wiz.mode, n)}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
