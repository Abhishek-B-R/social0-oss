"use client";
import { fetchApi } from "@/lib/fetch-api";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type DisconnectAccountModalProps = {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  accountLabel: string;
  onDisconnected?: (accountId: string) => void;
};

export function DisconnectAccountModal({
  isOpen,
  onClose,
  accountId,
  accountLabel,
  onDisconnected,
}: DisconnectAccountModalProps) {
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (!accountId) return;
    setDisconnecting(true);
    toast.dismiss();
    try {
      const res = await fetchApi(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to disconnect");
      }
      onClose();
      onDisconnected?.(accountId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="disconnect-modal-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-bg p-6 shadow-xl"
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
            <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="disconnect-modal-title"
              className="text-lg font-semibold text-text"
            >
              Disconnect account?
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Disconnecting will remove <strong>{accountLabel}</strong> from
              Social0. Your post history will be preserved.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={disconnecting}
            className="rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-text hover:bg-bg-subtle disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
    </div>
  );
}
