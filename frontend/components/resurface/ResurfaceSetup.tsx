"use client";

import { useState } from "react";
import { createResurfaceSchedule } from "@/app/actions/resurface";

const INTERVAL_OPTIONS = [
  { value: 1, label: "1h" },
  { value: 2, label: "2h" },
  { value: 4, label: "4h" },
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 48, label: "48h" },
  { value: 72, label: "72h" },
];

const MAX_OPTIONS = [1, 2, 3, 5, 10];

type ResurfaceSetupProps = {
  postId: string;
  onSuccess?: () => void;
  /** Pre-fill from form (e.g. when user set options before publishing) */
  initialIntervalHours?: number;
  initialMaxResurfaces?: number;
  initialPlugComment?: string;
};

export function ResurfaceSetup({
  postId,
  onSuccess,
  initialIntervalHours = 4,
  initialMaxResurfaces = 1,
  initialPlugComment = "",
}: ResurfaceSetupProps) {
  const [enabled, setEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(initialIntervalHours);
  const [maxResurfaces, setMaxResurfaces] = useState(initialMaxResurfaces);
  const [plugComment, setPlugComment] = useState(initialPlugComment);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleEnable = async () => {
    setError(null);
    setLoading(true);
    const result = await createResurfaceSchedule(
      postId,
      "x",
      intervalHours,
      maxResurfaces,
      plugComment.trim() || null,
    );
    setLoading(false);
    if (result.success) {
      setDone(true);
      onSuccess?.();
    } else {
      setError(result.error);
    }
  };

  if (done) {
    return (
      <p className="mt-4 text-sm text-emerald-600 font-medium">
        ♻️ Auto-Repost enabled. Your post will be retweeted at the chosen intervals.
      </p>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((e) => !e)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-emerald-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            } mt-0.5`}
          />
        </button>
        <span className="text-sm font-semibold text-gray-900">
          ♻️ Auto-Repost this post
        </span>
      </div>
      {enabled && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reshare every
            </label>
            <select
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Number of reshares
            </label>
            <select
              value={maxResurfaces}
              onChange={(e) => setMaxResurfaces(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {MAX_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Quote tweet text (optional)
            </label>
            <input
              type="text"
              value={plugComment}
              onChange={(e) => setPlugComment(e.target.value)}
              placeholder="Add text to post as a quote tweet with each reshare"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <button
            type="button"
            onClick={handleEnable}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Enabling…" : "Enable Auto-Repost"}
          </button>
        </div>
      )}
    </div>
  );
}
