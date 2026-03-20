"use client";

import type { AspectRatioGuidance } from "@/lib/video-aspect-ratio";
import { AlertTriangle, Check, Info } from "lucide-react";

export function AspectRatioGuidanceBanner({
  guidance,
}: {
  guidance: AspectRatioGuidance;
}) {
  const { variant, message } = guidance;
  const cls =
    variant === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
      : variant === "tiktok"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100"
        : "border-sky-500/40 bg-sky-500/10 text-sky-950 dark:text-sky-100";
  const Icon =
    variant === "success"
      ? Check
      : variant === "tiktok"
        ? AlertTriangle
        : Info;
  return (
    <div
      className={`flex gap-2 rounded-lg border px-3 py-2 text-xs leading-snug ${cls}`}
      role="status"
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
