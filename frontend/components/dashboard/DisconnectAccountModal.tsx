"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

type DisconnectAccountModalProps = {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  accountLabel: string;
  onDisconnected?: () => void;
};

export function DisconnectAccountModal({
  isOpen,
  onClose,
  accountId,
  accountLabel,
  onDisconnected,
}: DisconnectAccountModalProps) {
  const router = useRouter();
  const [publicationCount, setPublicationCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !accountId) {
      setPublicationCount(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/accounts/${accountId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        setPublicationCount(data.publicationCount ?? 0);
      })
      .catch(() => setError("Could not load post count"))
      .finally(() => setLoading(false));
  }, [isOpen, accountId]);

  const handleDisconnect = async () => {
    if (!accountId) return;
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to disconnect");
      }
      onClose();
      onDisconnected?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disconnect");
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
        className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="disconnect-modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              Disconnect account?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Disconnecting will remove <strong>{accountLabel}</strong> from
              Social0. All post history linked to this account will be removed
              from our records.
            </p>
            {loading ? (
              <p className="mt-3 text-sm text-gray-500">Loading…</p>
            ) : publicationCount !== null && publicationCount > 0 ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                {publicationCount} post{publicationCount !== 1 ? "s" : ""} will be
                affected.
              </p>
            ) : publicationCount === 0 ? (
              <p className="mt-3 text-sm text-gray-500">
                No posts are linked to this account.
              </p>
            ) : null}
            {error && (
              <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={disconnecting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
    </div>
  );
}
