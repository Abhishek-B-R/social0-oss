import { usePublishStore } from "@/stores/publish.store";
import { platformLabel } from "@/lib/platforms";

const PHASE_LABEL: Record<string, string> = {
  queued: "Queued",
  platform_queued: "Queued",
  platform_uploading: "Uploading",
  platform_success: "Published",
  platform_failed: "Failed",
  fan_out: "Processing",
  completed: "Done",
  failed: "Failed",
};

export function PublishProgressPanel() {
  const { isPublishing, platforms } = usePublishStore();

  if (!isPublishing && platforms.length === 0) {
    return (
      <aside className="rounded-xl border border-border bg-bg-elevated p-4">
        <h2 className="font-medium">Publish progress</h2>
        <p className="mt-2 text-sm text-text-muted">
          Live SSE updates appear here when you publish.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-xl border border-border bg-bg-elevated p-4">
      <h2 className="font-medium">Publish progress</h2>
      <ul className="mt-3 space-y-2">
        {platforms.map((p) => (
          <li
            key={`${p.platform}-${p.connectedAccountId}`}
            className="flex items-center justify-between text-sm"
          >
            <span>{platformLabel(p.platform)}</span>
            <span
              className={
                p.phase === "platform_failed" || p.phase === "failed"
                  ? "text-destructive"
                  : p.phase === "platform_success"
                    ? "text-accent"
                    : "text-text-muted"
              }
            >
              {PHASE_LABEL[p.phase] ?? p.phase}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
