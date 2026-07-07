
import type { AspectRatioGuidance } from "@/lib/video-aspect-ratio";
import { AlertTriangle } from "lucide-react";

export function AspectRatioGuidanceBanner({
  guidance,
}: {
  guidance: AspectRatioGuidance | null;
}) {
  if (!guidance) return null;

  return (
    <div
      className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
      role="alert"
    >
      <AlertTriangle
        className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300"
        aria-hidden
      />
      <span>{guidance.message}</span>
    </div>
  );
}
