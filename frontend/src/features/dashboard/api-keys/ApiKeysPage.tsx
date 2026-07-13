import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import DocsInfoIcon from "@/components/info-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchApi } from "@/lib/fetch-api";
import {
  DOCS_API_KEYS_URL,
  DOCS_API_QUICKSTART_URL,
  DOCS_API_URL,
  DOCS_API_WEBHOOKS_URL,
} from "@/lib/docs-url";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
};

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string | null;
};

const WEBHOOK_EVENT_OPTIONS = [
  "post.published",
  "post.failed",
  "post.scheduled",
  "post.deleted",
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

async function fetchApiKeys(): Promise<ApiKeyRow[]> {
  const res = await fetchApi("/api/api-keys");
  if (!res.ok) throw new Error("Failed to load API keys");
  const data = (await res.json()) as { keys: ApiKeyRow[] };
  return data.keys;
}

async function fetchWebhooks(): Promise<WebhookRow[]> {
  const res = await fetchApi("/api/webhooks/subscriptions");
  if (!res.ok) throw new Error("Failed to load webhooks");
  const data = (await res.json()) as { subscriptions: WebhookRow[] };
  return data.subscriptions;
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"keys" | "webhooks">("keys");
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([
    "post.published",
    "post.failed",
  ]);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const keysQuery = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });
  const webhooksQuery = useQuery({
    queryKey: ["webhooks"],
    queryFn: fetchWebhooks,
    enabled: tab === "webhooks",
  });

  const copyText = useCallback((text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }, []);

  const createKey = async () => {
    if (!keyName.trim()) return;
    setBusy(true);
    try {
      const res = await fetchApi("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create key");
      const data = (await res.json()) as { key: string };
      setNewKeyRaw(data.key);
      setKeyName("");
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key created");
    } catch {
      toast.error("Could not create API key");
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    const res = await fetchApi(`/api/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to revoke key");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    toast.success("API key revoked");
  };

  const renameKey = async () => {
    if (!renameId || !renameValue.trim()) return;
    setBusy(true);
    try {
      const res = await fetchApi(`/api/api-keys/${renameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error();
      setRenameId(null);
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key renamed");
    } catch {
      toast.error("Failed to rename key");
    } finally {
      setBusy(false);
    }
  };

  const regenerateKey = async (id: string) => {
    if (!confirm("Regenerate this key? The old key stops working immediately.")) return;
    setBusy(true);
    try {
      const res = await fetchApi(`/api/api-keys/${id}/regenerate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { key: string };
      setNewKeyRaw(data.key);
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key regenerated");
    } catch {
      toast.error("Failed to regenerate key");
    } finally {
      setBusy(false);
    }
  };

  const createWebhook = async () => {
    if (!webhookUrl.trim() || webhookEvents.length === 0) return;
    setBusy(true);
    try {
      const res = await fetchApi("/api/webhooks/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl.trim(), events: webhookEvents }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { secret: string };
      setNewWebhookSecret(data.secret);
      setWebhookUrl("");
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook created");
    } catch {
      toast.error("Failed to create webhook");
    } finally {
      setBusy(false);
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!confirm("Delete this webhook endpoint?")) return;
    const res = await fetchApi(`/api/webhooks/subscriptions/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete webhook");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    toast.success("Webhook deleted");
  };

  return (
    <div className="mx-auto w-full max-w-4xl sm:mt-10">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
          Developer
        </h1>
        <DocsInfoIcon url={DOCS_API_KEYS_URL} />
      </div>
      <p className="mt-2 text-text-muted">
        API keys and webhooks for programmatic access.{" "}
        <a
          href={DOCS_API_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          REST API docs
        </a>
        {" · "}
        <a
          href={DOCS_API_QUICKSTART_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          Quickstart
        </a>
        {" · "}
        <a
          href={DOCS_API_WEBHOOKS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          Webhooks
        </a>
      </p>

      <div className="mt-6 flex gap-2 border-b border-border">
        {(["keys", "webhooks"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-text-muted hover:text-foreground",
            )}
          >
            {t === "keys" ? "API Keys" : "Webhooks"}
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <p className="text-sm text-text-muted">
              Secret keys are shown once. Prefix: <code className="text-xs">sk_live_</code>
            </p>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Create key
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-bg-elevated overflow-hidden shadow-sm">
            {keysQuery.isLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              </div>
            ) : keysQuery.data?.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No API keys yet. Create one to get started.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-subtle text-left text-text-muted">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Key</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Last used</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Created</th>
                    <th className="px-4 py-3 font-medium w-32" />
                  </tr>
                </thead>
                <tbody>
                  {keysQuery.data?.map((key) => (
                    <tr key={key.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{key.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">
                        {key.keyPrefix}…
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-text-muted">
                        {formatDate(key.lastUsedAt)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-text-muted">
                        {formatDate(key.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRenameId(key.id);
                              setRenameValue(key.name);
                            }}
                            title="Rename"
                          >
                            Rename
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => regenerateKey(key.id)}
                            title="Regenerate"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeKey(key.id)}
                            title="Revoke"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "webhooks" && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <p className="text-sm text-text-muted">
              Receive HTTP POST notifications when posts are published, failed, scheduled, or
              deleted.{" "}
              <a
                href={DOCS_API_WEBHOOKS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                Webhook docs
              </a>
            </p>
            <Button onClick={() => setWebhookOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add endpoint
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-bg-elevated overflow-hidden shadow-sm">
            {webhooksQuery.isLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              </div>
            ) : webhooksQuery.data?.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                No webhooks configured.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {webhooksQuery.data?.map((wh) => (
                  <li key={wh.id} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate">{wh.url}</p>
                      <p className="text-xs text-text-muted mt-1">
                        {wh.events.join(", ")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteWebhook(wh.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Give your key a name so you can identify it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Production server"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createKey} disabled={busy || !keyName.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!newKeyRaw}
        onOpenChange={(open) => !open && setNewKeyRaw(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
            <DialogDescription>
              This is the only time we will show this key. Store it securely.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={newKeyRaw ?? ""} className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => newKeyRaw && copyText(newKeyRaw, "API key")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKeyRaw(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameId} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename API key</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button onClick={renameKey} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={webhookOpen} onOpenChange={setWebhookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Endpoint URL</Label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/webhooks/social0"
              />
            </div>
            <div>
              <Label>Events</Label>
              <div className="mt-2 space-y-2">
                {WEBHOOK_EVENT_OPTIONS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes(ev)}
                      onChange={(e) => {
                        setWebhookEvents((prev) =>
                          e.target.checked
                            ? [...prev, ev]
                            : prev.filter((x) => x !== ev),
                        );
                      }}
                    />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createWebhook} disabled={busy}>
              Create webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!newWebhookSecret}
        onOpenChange={(o) => !o && setNewWebhookSecret(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook signing secret</DialogTitle>
            <DialogDescription>
              Verify the{" "}
              <code className="text-xs">X-Social0-Signature</code> header with
              HMAC-SHA256 and this secret.{" "}
              <a
                href={DOCS_API_WEBHOOKS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                Webhook docs
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={newWebhookSecret ?? ""} className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                newWebhookSecret && copyText(newWebhookSecret, "Webhook secret")
              }
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewWebhookSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
