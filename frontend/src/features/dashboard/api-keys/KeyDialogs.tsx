import { HOME_QUERY_KEY } from "@/features/dashboard/home/use-home-data";
import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { revokeApiKey } from "@/api/dashboard";
import {
  AGENTS_QUERY_KEYS,
  createApiKey,
  regenerateApiKey,
  renameApiKey,
} from "./agents-api";
import { CodeField, ConfirmDialog, CopyButton } from "./agents-ui";
import {
  claudeCodeMcpCommand,
  envVarLine,
  HOSTED_MCP_URL,
} from "./agents-setup";

const NAME_MAX = 120;

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In 1 year" },
] as const;
type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]["value"];

function expiryIso(option: ExpiryOption): string | null {
  if (option === "never") return null;
  return new Date(Date.now() + Number(option) * 86_400_000).toISOString();
}

function useInvalidateKeys() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEYS.keys }),
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEYS.connections }),
      // Home's "Connect your AI agent" checklist step reads API keys.
      queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY }),
    ]);
}

export type RevealedKey = {
  raw: string;
  name: string;
  kind: "created" | "regenerated";
};

// ── Create ──────────────────────────────────────────────────────────────────

export function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
  defaultName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: RevealedKey) => void;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [expiry, setExpiry] = useState<ExpiryOption>("never");
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(defaultName);
      setExpiry("never");
    }
  }
  const nameId = useId();
  const expiryId = useId();
  const invalidate = useInvalidateKeys();

  const mutation = useMutation({
    mutationFn: () => createApiKey({ name: name.trim(), expiresAt: expiryIso(expiry) }),
    onSuccess: async (data) => {
      onOpenChange(false);
      onCreated({ raw: data.key, name: name.trim(), kind: "created" });
      await invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Couldn't create the key. Try again.");
    },
  });

  const trimmed = name.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && !mutation.isPending) mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Name it after where it will live, so you know what breaks if you revoke it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              maxLength={NAME_MAX}
              autoComplete="off"
              autoFocus
              placeholder="Production server, laptop, n8n…"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={expiryId}>Expires</Label>
            <select
              id={expiryId}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ExpiryOption)}
              className="h-10 w-full rounded-xl border border-input bg-bg px-3 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 touch:min-h-11"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Reveal once ─────────────────────────────────────────────────────────────

export function RevealKeyDialog({
  revealed,
  onClose,
}: {
  revealed: RevealedKey | null;
  onClose: () => void;
}) {
  const raw = revealed?.raw ?? "";
  return (
    <Dialog open={!!revealed} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {revealed?.kind === "regenerated" ? "Key regenerated" : "Key created"}
          </DialogTitle>
          <DialogDescription>
            Copy the key for{" "}
            <span className="font-medium text-text">{revealed?.name || "this key"}</span> now.
            It's stored hashed, so you won't see it again.
            {revealed?.kind === "regenerated"
              ? " The old key has stopped working."
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <CodeField value={raw} copyLabel="Copy key" toastLabel="API key copied" aria-label="New API key" />
          <div className="flex flex-wrap gap-2">
            <CopyButton
              text={envVarLine(raw)}
              label="Copy as env var"
              toastLabel="Env var copied"
            />
            <CopyButton
              text={claudeCodeMcpCommand(raw)}
              label="Copy Claude Code command"
              toastLabel="Command copied"
            />
          </div>
          <p className="border-t border-border pt-4 text-[13px] text-text-muted">
            ChatGPT and Claude on the web don't need a key: add{" "}
            <code className="font-mono text-[12px] text-text">{HOSTED_MCP_URL}</code> as a
            connector and sign in. That creates an <span className="font-medium text-text">MCP
            Connector</span> key you can revoke here anytime.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rename ──────────────────────────────────────────────────────────────────

export function RenameKeyDialog({
  target,
  onClose,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState(target?.name ?? "");
  const [prevId, setPrevId] = useState(target?.id ?? null);
  if ((target?.id ?? null) !== prevId) {
    setPrevId(target?.id ?? null);
    setValue(target?.name ?? "");
  }
  const inputId = useId();
  const invalidate = useInvalidateKeys();
  const mutation = useMutation({
    mutationFn: () => renameApiKey(target!.id, value.trim()),
    onSuccess: async () => {
      toast.success("Key renamed");
      onClose();
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn't rename the key. Try again."),
  });
  const trimmed = value.trim();
  const unchanged = trimmed === target?.name;

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && !unchanged && !mutation.isPending) mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename key</DialogTitle>
            <DialogDescription>The key itself doesn't change.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>Name</Label>
            <Input
              id={inputId}
              value={value}
              maxLength={NAME_MAX}
              autoFocus
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || unchanged || mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Regenerate ──────────────────────────────────────────────────────────────

export function RegenerateKeyDialog({
  target,
  onClose,
  onRegenerated,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onRegenerated: (key: RevealedKey) => void;
}) {
  const invalidate = useInvalidateKeys();
  const mutation = useMutation({
    mutationFn: () => regenerateApiKey(target!.id),
    onSuccess: async (data) => {
      const name = target?.name ?? data.apiKey?.name ?? "API key";
      onClose();
      onRegenerated({ raw: data.key, name, kind: "regenerated" });
      await invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Couldn't regenerate the key. Try again.",
      ),
  });
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={`Regenerate "${target?.name ?? ""}"?`}
      description={
        <p>
          The current key stops working right away. Anything using it (scripts, CI, agents)
          needs the new key you'll get next.
        </p>
      }
      tone="default"
      confirmLabel="Regenerate key"
      pendingLabel="Regenerating…"
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    />
  );
}

// ── Revoke ──────────────────────────────────────────────────────────────────

export function RevokeKeyDialog({
  target,
  onClose,
}: {
  target: { id: string; name: string; isMcpConnector?: boolean; agentLabel?: string } | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidateKeys();
  const mutation = useMutation({
    mutationFn: () => revokeApiKey(target!.id),
    onSuccess: async () => {
      toast.success(
        target?.isMcpConnector
          ? `${target.agentLabel ?? "The MCP host"} is disconnected`
          : "Key revoked",
      );
      onClose();
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn't revoke the key. Try again."),
  });
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={
        target?.isMcpConnector
          ? `Disconnect ${target.agentLabel ?? "this MCP host"}?`
          : `Revoke "${target?.name ?? ""}"?`
      }
      description={
        target?.isMcpConnector ? (
          <p>
            {target.agentLabel ?? "The host"} loses access to Social0 right away. To use it
            again, add the connector and sign in again. Posts it already created stay.
          </p>
        ) : (
          <p>
            Anything using this key stops working right away. This can't be undone. Posts it
            already created stay.
          </p>
        )
      }
      confirmPhrase="revoke"
      confirmLabel={target?.isMcpConnector ? "Disconnect" : "Revoke key"}
      pendingLabel={target?.isMcpConnector ? "Disconnecting…" : "Revoking…"}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    />
  );
}
