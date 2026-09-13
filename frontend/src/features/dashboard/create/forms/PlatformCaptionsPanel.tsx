import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import { getLimitForAccount } from "@/lib/platform-limits";
import { PLATFORMS } from "@/lib/platforms";
import type { PlatformCaptionState } from "./types";

type CaptionAccount = { platform: string; isTwitterPremium?: boolean | null };

function platformDisplayName(platformId: string): string {
  return PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;
}

/**
 * How the caption will land on that platform: truncated to the strictest limit
 * among the selected accounts for it, since one caption goes to all of them.
 */
function captionPreview(
  platformId: string,
  rawCaption: string,
  selectedAccounts: readonly CaptionAccount[],
): string {
  const trimmed = rawCaption.trim();
  if (!trimmed) return "";
  const platformAccounts = selectedAccounts.filter(
    (account) => account.platform === platformId,
  );
  const limit =
    platformAccounts.length > 0
      ? Math.min(
          ...platformAccounts.map((account) => getLimitForAccount(account)),
        )
      : getLimitForAccount({ platform: platformId, isTwitterPremium: false });
  if (trimmed.length <= limit) return trimmed;
  if (limit <= 3) return "...";
  return `${trimmed.slice(0, limit - 3)}...`;
}

/**
 * Per-platform caption overrides, one card per selected platform.
 *
 * The image and video forms rendered this identically, helpers included. The
 * text form's version is deliberately not shared: it keys overrides by account
 * rather than by platform and shows an avatar per row, which is a different
 * feature wearing similar markup.
 */
export function PlatformCaptionsPanel(props: {
  platforms: readonly string[];
  captions: Record<string, PlatformCaptionState>;
  setCaptions: React.Dispatch<
    React.SetStateAction<Record<string, PlatformCaptionState>>
  >;
  /** The main caption, shown as the placeholder while a platform inherits it. */
  content: string;
  selectedAccounts: readonly CaptionAccount[];
}) {
  return (
    <div className="mt-2 border-t border-border pt-4 space-y-4">
      {props.platforms.map((platformId) => {
        const state = props.captions[platformId] ?? {
          overridden: false,
          value: "",
        };
        const effectiveCaption = state.overridden ? state.value : props.content;
        const previewCaption = captionPreview(
          platformId,
          effectiveCaption,
          props.selectedAccounts,
        );
        return (
          <div
            key={platformId}
            className="rounded-xl border border-border bg-bg p-4"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-text">
                {platformDisplayName(platformId)}
              </span>
              <div className="flex items-center gap-2">
                {state.overridden ? (
                  <>
                    <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                      Edited caption
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        props.setCaptions((prev) => ({
                          ...prev,
                          [platformId]: { overridden: false, value: "" },
                        }))
                      }
                      className="text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-text-muted">
                      Using main caption
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        props.setCaptions((prev) => ({
                          ...prev,
                          [platformId]: {
                            overridden: true,
                            value: props.content.trim(),
                          },
                        }))
                      }
                      className="text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>
            </div>
            <AutoResizeTextarea
              rows={3}
              placeholder={
                state.overridden
                  ? undefined
                  : props.content || "Main caption..."
              }
              value={state.overridden ? state.value : ""}
              readOnly={!state.overridden}
              onChange={(e) =>
                state.overridden &&
                props.setCaptions((prev) => ({
                  ...prev,
                  [platformId]: {
                    ...(prev[platformId] ?? { overridden: false, value: "" }),
                    overridden: true,
                    value: e.target.value,
                  },
                }))
              }
              className="w-full rounded-lg border border-input bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-70"
              maxHeight={160}
            />
            <p className="mt-2 text-xs text-text-muted">
              Preview: {previewCaption || "No caption"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
