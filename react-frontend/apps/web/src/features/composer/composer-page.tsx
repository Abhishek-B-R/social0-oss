import { useState } from "react";
import { useAccounts, usePublishPost } from "@/hooks/use-publish";
import { usePublishStore } from "@/stores/publish.store";
import { platformLabel } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { PublishProgressPanel } from "@/features/publishing/publish-progress-panel";

export function ComposerPage() {
  const { data: accounts = [] } = useAccounts();
  const publish = usePublishPost();
  const { isPublishing } = usePublishStore();
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  function toggleAccount(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Composer</h1>
        <textarea
          className="min-h-[200px] w-full rounded-xl border border-border bg-bg-elevated p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="What's on your mind?"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-muted">Accounts</p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAccount(a.id)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  selected.includes(a.id)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-text-muted"
                }`}
              >
                {platformLabel(a.platform)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={!caption.trim() || selected.length === 0 || isPublishing}
            onClick={() =>
              publish.mutate({
                postId: crypto.randomUUID(),
                connectedAccountIds: selected,
                mode: "now",
              })
            }
          >
            Publish now
          </Button>
        </div>
        <p className="text-xs text-text-subtle">
          Note: wire post creation via /v1/posts before production — composer currently needs a real postId from backend.
        </p>
      </div>
      <PublishProgressPanel />
    </div>
  );
}
