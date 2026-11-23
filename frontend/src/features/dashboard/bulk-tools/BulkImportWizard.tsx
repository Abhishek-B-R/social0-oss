import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import Link from "@/components/AppLink";
import { useDashboardPath } from "@/components/app";
import { Button } from "@/components/ui/button";
import { BulkScheduleOverlay } from "@/components/bulk-tools/BulkScheduleOverlay";
import type { BulkImportScope } from "./bulk-import-model";
import { MapStep } from "./MapStep";
import { ReviewStep } from "./ReviewStep";
import { UploadStep } from "./UploadStep";
import { useBulkImport, type WizardStep } from "./use-bulk-import";
import { WizardSteps } from "./WizardSteps";

function doneVerb(mode: "schedule" | "queue" | "draft"): string {
  if (mode === "queue") return "added to your queue";
  if (mode === "draft") return "saved as drafts";
  return "scheduled";
}

/** Upload → Match → Review, then import valid rows as scheduled, queued or drafts. */
export function BulkImportWizard({ scope }: { scope: BulkImportScope }) {
  const wiz = useBulkImport(scope);
  const dash = useDashboardPath();
  const [step, setStep] = useState<WizardStep>(1);

  const canLeaveUpload =
    wiz.pendingRows.length > 0 && wiz.selectedAccounts.length > 0 && wiz.probing === 0;
  const maxReachable: WizardStep = canLeaveUpload ? 3 : 1;
  const go = (s: WizardStep) => {
    if (s > 1 && !canLeaveUpload) return;
    setStep(s);
    // The dashboard scrolls inside `<main>`, not the window.
    const scroller =
      document.querySelector<HTMLElement>("[data-dashboard-main]") ?? window;
    scroller.scrollTo({ top: 0, behavior: "smooth" });
  };

  // All files removed: back to the upload step.
  const current: WizardStep = step > 1 && wiz.pendingRows.length === 0 ? 1 : step;

  // Everything imported: say so, and offer the next thing to do.
  if (wiz.pendingRows.length === 0 && wiz.importedTotal > 0 && wiz.result && !wiz.progress) {
    const mode = wiz.result.mode;
    return (
      <div className="rounded-2xl border border-border bg-bg-elevated px-6 py-10 text-center" role="status">
        <CheckCircle2 className="mx-auto size-8 text-ok" aria-hidden />
        <p className="mt-3 text-lg font-semibold tracking-tight text-text">
          {wiz.importedTotal} post{wiz.importedTotal === 1 ? "" : "s"} {doneVerb(mode)}
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {mode === "draft"
            ? "Find them under Posts › Drafts."
            : "They'll publish on their own. Check the calendar to see them."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={dash(mode === "draft" ? "posts?tab=drafts" : "calendar")}
            className="inline-flex h-9 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground shadow-sm hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
          >
            {mode === "draft" ? "Open drafts" : "View calendar"}
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              wiz.startOver();
              setStep(1);
            }}
          >
            Import more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <WizardSteps current={current} maxReachable={maxReachable} onGo={go} />

      {current === 1 ? (
        <UploadStep wiz={wiz} onContinue={() => go(2)} />
      ) : current === 2 ? (
        <MapStep wiz={wiz} onBack={() => go(1)} onContinue={() => go(3)} />
      ) : (
        <ReviewStep wiz={wiz} onBack={() => go(2)} onGoStep={go} />
      )}

      {wiz.progress ? (
        <BulkScheduleOverlay
          phase={wiz.progress.phase}
          uploadPercent={wiz.progress.uploadPercent}
          totalItems={wiz.progress.total}
          creatingIndex={wiz.progress.creatingIndex}
          mode={wiz.mode}
          onCancel={wiz.cancelImport}
        />
      ) : null}
    </div>
  );
}
