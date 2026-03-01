"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { disableResurfaceSchedule } from "@/app/actions/resurface";

export type ResurfaceScheduleInfo = {
  id: string;
  isActive: boolean;
  resurfacesDone: number;
  maxResurfaces: number;
  intervalHours: number;
  plugComment: string | null;
};

type ResurfaceStatusBadgeProps = {
  schedule: ResurfaceScheduleInfo;
};

export function ResurfaceStatusBadge({ schedule }: ResurfaceStatusBadgeProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  const isDone =
    !schedule.isActive || schedule.resurfacesDone >= schedule.maxResurfaces;
  const label = isDone ? "  Done" : "  Active";

  const handleDisable = async () => {
    setDisableError(null);
    setDisabling(true);
    const result = await disableResurfaceSchedule(schedule.id);
    setDisabling(false);
    if (result.success) {
      setOpen(false);
      router.refresh();
    } else {
      setDisableError(result.error ?? "Failed to disable");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDisableError(null);
        }}
        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
          isDone
            ? "bg-gray-100 dark:bg-bg-muted text-gray-600 dark:text-text-muted hover:bg-gray-200 dark:hover:bg-bg-subtle"
            : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
        }`}
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resurface-modal-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="resurface-modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              Auto-Repost (X)
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="font-medium text-gray-900">
                  {isDone ? "Done" : "Active"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Reshares</dt>
                <dd className="font-medium text-gray-900">
                  {schedule.resurfacesDone} / {schedule.maxResurfaces}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Interval</dt>
                <dd className="font-medium text-gray-900">
                  Every {schedule.intervalHours}h
                </dd>
              </div>
              {schedule.plugComment && (
                <div>
                  <dt className="text-gray-500">Quote tweet</dt>
                  <dd className="font-medium text-gray-900 line-clamp-2">
                    {schedule.plugComment}
                  </dd>
                </div>
              )}
            </dl>
            {disableError && (
              <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                {disableError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
              {schedule.isActive && (
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={disabling}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {disabling ? "Disabling…" : "Disable"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
