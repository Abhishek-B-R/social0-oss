import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { rpc } from "@/lib/rpc";
import {
  DOCS_API_QUICKSTART_URL,
  DOCS_API_URL,
  DOCS_API_WEBHOOKS_URL,
  DOCS_CLI_QUICKSTART_URL,
  DOCS_CLI_URL,
  DOCS_MCP_QUICKSTART_URL,
  DOCS_MCP_URL,
} from "@/lib/docs-url";
import type { SubscriptionTier } from "@/lib/plans";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowClockwise,
  Copy,
  Key,
  Plus,
  Trash,
  WebhooksLogo,
} from "@/icons/phosphor";
import { ApiKeysTableSkeleton } from "@/components/ui/page-skeletons";

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

const HOSTED_MCP_URL = "https://mcp.social0.app/mcp";

const CLI_LOCAL_COMMANDS = [
  "npm install -g social0",
  "social0 login",
  "npx skills add Abhishek-B-R/social0-cli --skill social0",
] as const;

const CLI_REMOTE_COMMANDS = [
  "npm install -g social0",
  "export SOCIAL0_API_KEY=sk_live_...",
  "social0 whoami",
] as const;

const MCP_CLI_COMMAND =
  "claude mcp add --transport stdio social0 --env SOCIAL0_API_KEY=sk_live_... -- npx -y @social0/mcp";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function apiRequestsPerHour(tier: SubscriptionTier): number {
  switch (tier) {
    case "max":
      return 10000;
    case "pro":
      return 5000;
    case "growth":
      return 1000;
    case "starter":
      return 300;
    default:
      return 60;
  }
}

function planShortLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case "max":
      return "Max";
    case "pro":
      return "Pro";
    case "growth":
      return "Growth";
    case "starter":
      return "Starter";
    default:
      return "Free";
  }
}

function normalizeTier(raw: string | undefined): SubscriptionTier {
  if (
    raw === "starter" ||
    raw === "growth" ||
    raw === "pro" ||
    raw === "max"
  ) {
    return raw;
  }
  return "free";
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

function DocsLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-accent underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-white p-0.5 dark:bg-bg-elevated">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === option.id
              ? "bg-zinc-100 text-foreground dark:bg-zinc-800"
              : "bg-transparent text-text-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CopyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-bg hover:text-foreground dark:bg-bg-elevated"
    >
      <Copy className="h-3.5 w-3.5" size={14} />
      Copy
    </button>
  );
}

/** Grey content bar + white Copy — cool grey so it doesn’t read as muddy beige. */
function CopyCommandRow({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2.5 dark:bg-zinc-800/80">
        <code className="block whitespace-nowrap font-mono text-[12px] text-foreground sm:text-[13px]">
          {command}
        </code>
      </div>
      <CopyButton
        onClick={() => {
          void navigator.clipboard.writeText(command);
          toast.success("Copied");
        }}
      />
    </div>
  );
}

function SecretField({
  value,
  onCopy,
}: {
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2.5 dark:bg-zinc-800/80">
        <code className="block whitespace-nowrap font-mono text-[12px] text-foreground">
          {value}
        </code>
      </div>
      <CopyButton onClick={onCopy} />
    </div>
  );
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyKind, setNewKeyKind] = useState<"created" | "regenerated">(
    "created",
  );
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
  const [tab, setTab] = useState<"keys" | "webhooks">("keys");
  const [cliMode, setCliMode] = useState<"local" | "remote">("local");
  const [mcpMode, setMcpMode] = useState<"cli" | "remote">("cli");

  const keysQuery = useQuery({ queryKey: ["api-keys"], queryFn: fetchApiKeys });
  const webhooksQuery = useQuery({
    queryKey: ["webhooks"],
    queryFn: fetchWebhooks,
    enabled: tab === "webhooks",
  });
  const settingsQuery = useQuery({
    queryKey: ["composer-settings"],
    queryFn: () =>
      rpc<{
        subscriptionTier: string;
        subscriptionExpiresAt: string | null;
      }>("dashboard-data.loadComposerSettings"),
  });

  const rawTier = settingsQuery.data?.subscriptionTier ?? "free";
  const subExpiresAt = settingsQuery.data?.subscriptionExpiresAt ?? null;
  const effectiveTier: SubscriptionTier =
    subExpiresAt && new Date(subExpiresAt) < new Date()
      ? "free"
      : normalizeTier(rawTier);
  const rateLimit = apiRequestsPerHour(effectiveTier);

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
      const createdName = keyName.trim();
      setNewKeyName(createdName);
      setNewKeyKind("created");
      setNewKeyRaw(data.key);
      setKeyName("");
      setCreateOpen(false);
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
    if (!confirm("Regenerate this key? The old key stops working immediately."))
      return;
    setBusy(true);
    try {
      const res = await fetchApi(`/api/api-keys/${id}/regenerate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { key: string };
      const existing = keysQuery.data?.find((k) => k.id === id);
      setNewKeyName(existing?.name ?? "API key");
      setNewKeyKind("regenerated");
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

  const cliCommands =
    cliMode === "local" ? CLI_LOCAL_COMMANDS : CLI_REMOTE_COMMANDS;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 sm:pb-12">
      <header>
        <h1 className="font-logo text-[2rem] font-normal tracking-tight text-foreground sm:text-[2.35rem] sm:leading-tight">
          Developer
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          API keys, webhooks, CLI, and MCP — same publish pipeline as the
          dashboard.{" "}
          <DocsLink href={DOCS_API_QUICKSTART_URL}>API quickstart</DocsLink>
        </p>
      </header>

      {/* ── API Keys / Webhooks ─────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex gap-2 border-b border-border">
          {(
            [
              { id: "keys", label: "API Keys" },
              { id: "webhooks", label: "Webhooks" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium -mb-px transition-colors",
                tab === item.id
                  ? "border-accent text-foreground"
                  : "border-transparent text-text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "keys" ? (
          <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm dark:bg-bg-elevated sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <p className="max-w-2xl text-sm text-text-muted">
                Server-side secrets for the REST API, CLI, and local MCP. Treat
                them like passwords — never expose them in client-side code.
              </p>
              <DocsLink href={DOCS_API_URL}>Docs</DocsLink>
            </div>

            <p className="text-sm text-text-muted">
              Your plan:{" "}
              <span className="font-medium text-foreground">
                {planShortLabel(effectiveTier)}
              </span>
              {" · "}
              {rateLimit.toLocaleString()} req/hour
              {" · "}
              Prefix{" "}
              <code className="rounded bg-bg-muted px-1 text-xs">sk_live_</code>
            </p>

            <div className="overflow-hidden rounded-xl border border-border bg-bg-muted/40">
              {keysQuery.isLoading ? (
                <ApiKeysTableSkeleton />
              ) : keysQuery.data?.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-8 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg-muted text-text-muted">
                    <Key className="h-5 w-5" size={20} />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No API keys yet
                  </p>
                  <p className="mt-1 max-w-sm text-sm text-text-muted">
                    Create one to start using the Social0 API, CLI, or local MCP
                    server.
                  </p>
                  <Button
                    className="mt-4"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="mr-1 h-4 w-4" size={16} />
                    Create API key
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 dark:bg-bg-elevated">
                    <p className="text-sm text-text-muted">
                      {keysQuery.data?.length} key
                      {keysQuery.data?.length === 1 ? "" : "s"}
                    </p>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="mr-1 h-4 w-4" size={16} />
                      Create API key
                    </Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg-muted/60 text-left text-text-muted">
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Key</th>
                        <th className="hidden px-4 py-3 font-medium sm:table-cell">
                          Last used
                        </th>
                        <th className="hidden px-4 py-3 font-medium md:table-cell">
                          Created
                        </th>
                        <th className="w-32 px-4 py-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-bg-elevated">
                      {keysQuery.data?.map((key) => (
                        <tr
                          key={key.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-3 font-medium">{key.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-text-muted">
                            {key.keyPrefix}…
                          </td>
                          <td className="hidden px-4 py-3 text-text-muted sm:table-cell">
                            {formatDate(key.lastUsedAt)}
                          </td>
                          <td className="hidden px-4 py-3 text-text-muted md:table-cell">
                            {formatDate(key.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRenameId(key.id);
                                  setRenameValue(key.name);
                                }}
                              >
                                Rename
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Regenerate"
                                onClick={() => regenerateKey(key.id)}
                              >
                                <ArrowClockwise className="h-4 w-4" size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Revoke"
                                onClick={() => revokeKey(key.id)}
                              >
                                <Trash
                                  className="h-4 w-4 text-destructive"
                                  size={16}
                                />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm dark:bg-bg-elevated sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <p className="max-w-2xl text-sm text-text-muted">
                Get HTTP POSTs when posts are published, failed, scheduled, or
                deleted. Verify with X-Social0-Signature (HMAC-SHA256).
              </p>
              <DocsLink href={DOCS_API_WEBHOOKS_URL}>Webhook docs</DocsLink>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-bg-muted/40">
              {webhooksQuery.isLoading ? (
                <ApiKeysTableSkeleton />
              ) : webhooksQuery.data?.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-8 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg-muted text-text-muted">
                    <WebhooksLogo className="h-5 w-5" size={20} />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No webhooks yet
                  </p>
                  <p className="mt-1 max-w-sm text-sm text-text-muted">
                    Add an endpoint to receive signed event notifications from
                    Social0.
                  </p>
                  <Button
                    className="mt-4"
                    size="sm"
                    onClick={() => setWebhookOpen(true)}
                  >
                    <Plus className="mr-1 h-4 w-4" size={16} />
                    Add endpoint
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 dark:bg-bg-elevated">
                    <p className="text-sm text-text-muted">
                      {webhooksQuery.data?.length} endpoint
                      {webhooksQuery.data?.length === 1 ? "" : "s"}
                    </p>
                    <Button size="sm" onClick={() => setWebhookOpen(true)}>
                      <Plus className="mr-1 h-4 w-4" size={16} />
                      Add endpoint
                    </Button>
                  </div>
                  <ul className="divide-y divide-border bg-white dark:bg-bg-elevated">
                    {webhooksQuery.data?.map((wh) => (
                      <li
                        key={wh.id}
                        className="flex items-start justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs">{wh.url}</p>
                          <p className="mt-1 text-xs text-text-muted">
                            {wh.events.join(", ")}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteWebhook(wh.id)}
                        >
                          <Trash className="h-4 w-4" size={16} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── CLI & AI Skills ──────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            CLI & AI Skills
          </h2>
          <DocsLink href={DOCS_CLI_URL}>CLI docs</DocsLink>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm dark:bg-bg-elevated sm:p-5">
          <p className="text-sm text-text-muted">
            Use the Social0 CLI from your terminal, CI, or AI coding agents to
            read data and queue posts.
          </p>

          <SegmentedControl
            value={cliMode}
            onChange={setCliMode}
            options={[
              { id: "local", label: "Locally" },
              { id: "remote", label: "CI & remote" },
            ]}
          />

          <div className="space-y-2">
            {cliCommands.map((command) => (
              <CopyCommandRow key={command} command={command} />
            ))}
          </div>

          <p className="text-xs text-text-muted">
            Prefer a one-liner? See the{" "}
            <DocsLink href={DOCS_CLI_QUICKSTART_URL}>CLI quickstart</DocsLink>.
          </p>
        </div>
      </section>

      {/* ── MCP ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            MCP
          </h2>
          <DocsLink href={DOCS_MCP_URL}>MCP docs</DocsLink>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm dark:bg-bg-elevated sm:p-5">
          <p className="text-sm text-text-muted">
            Connect Claude Code, Cursor, ChatGPT, and other MCP clients
            directly to your Social0 workspace.
          </p>

          <SegmentedControl
            value={mcpMode}
            onChange={setMcpMode}
            options={[
              { id: "cli", label: "CLI (Claude Code / Cursor)" },
              { id: "remote", label: "Remote servers (ChatGPT, Claude)" },
            ]}
          />

          {mcpMode === "cli" ? (
            <div className="space-y-3">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-muted">
                <li>Create an API key above.</li>
                <li>Run the command below (replace the placeholder key).</li>
                <li>Ask your agent about accounts, drafts, or publishing.</li>
              </ol>
              <CopyCommandRow command={MCP_CLI_COMMAND} />
              <p className="text-xs text-text-muted">
                Replace <code className="text-[11px]">sk_live_...</code> with a
                key created above. More hosts in the{" "}
                <DocsLink href={DOCS_MCP_QUICKSTART_URL}>MCP quickstart</DocsLink>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">
                Add this URL as a custom connector (ChatGPT) or remote MCP
                server (claude.ai). Use OAuth when prompted — do not put API
                keys in the URL.
              </p>
              <CopyCommandRow command={HOSTED_MCP_URL} />
              <p className="text-xs text-text-muted">
                OAuth creates a dedicated{" "}
                <span className="font-medium text-foreground">MCP Connector</span>{" "}
                API key in this list — revoke it here anytime to cut off remote
                access.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Dialogs */}
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
              {busy ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!newKeyRaw}
        onOpenChange={(open) => {
          if (!open) {
            setNewKeyRaw(null);
            setNewKeyName("");
            setNewKeyKind("created");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {newKeyKind === "regenerated"
                ? "API key regenerated"
                : "API key created"}
            </DialogTitle>
            <DialogDescription>
              Copy your new key
              {newKeyName ? (
                <>
                  {" "}
                  for{" "}
                  <span className="font-medium text-foreground">
                    &apos;{newKeyName}&apos;
                  </span>
                </>
              ) : null}{" "}
              now. For security it is stored hashed, so it will not be shown
              again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <SecretField
              value={newKeyRaw ?? ""}
              onCopy={() => newKeyRaw && copyText(newKeyRaw, "API key")}
            />

            <div className="space-y-2">
              <p className="text-sm text-text-muted">
                MCP URL (remote clients like ChatGPT and Claude)
              </p>
              <SecretField
                value={HOSTED_MCP_URL}
                onCopy={() => copyText(HOSTED_MCP_URL, "MCP URL")}
              />
              <p className="text-xs text-text-muted">
                Uses Social0 OAuth — approving creates an{" "}
                <span className="font-medium text-foreground">MCP Connector</span>{" "}
                key here (not in the URL). Revoke that key to cut off access.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setNewKeyRaw(null);
                setNewKeyName("");
                setNewKeyKind("created");
              }}
            >
              Done
            </Button>
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
            <Input
              readOnly
              value={newWebhookSecret ?? ""}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                newWebhookSecret && copyText(newWebhookSecret, "Webhook secret")
              }
            >
              <Copy className="h-4 w-4" size={16} />
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
