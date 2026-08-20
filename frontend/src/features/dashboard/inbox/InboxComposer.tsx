import { useCallback, useEffect, useRef, useState } from "react";
import { CircleNotch, Paperclip, PaperPlaneTilt, X } from "@/icons/phosphor";
import { cn } from "@/lib/utils";
import { inboxMediaAccept, pickInboxFileFromClipboard, pickInboxFileFromList } from "@/lib/inbox-media";
import { toast } from "sonner";

export type InboxComposerPayload = {
  text: string;
  file?: File | null;
  previewUrl?: string | null;
};

export function InboxComposer({
  platform,
  mode,
  maxLength,
  placeholder,
  disabled,
  sending,
  initialText = "",
  variant = "default",
  replyTo,
  onSend,
}: {
  platform: string;
  mode: "dm" | "comment";
  maxLength: number;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  initialText?: string;
  variant?: "default" | "embedded";
  replyTo?: { name: string; onClear: () => void } | null;
  onSend: (payload: InboxComposerPayload) => void;
}) {
  const [draft, setDraft] = useState(initialText);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const accept = inboxMediaAccept(platform, mode);
  const canAttach = Boolean(accept);

  useEffect(() => {
    setDraft(initialText);
  }, [initialText]);

  const clearFile = useCallback(() => {
    // ponytail: don't revoke blob URLs — the optimistic bubble still uses them
    setPreviewUrl(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const pickFile = useCallback(
    (next: File | null) => {
      clearFile();
      if (!next) return;
      if (!pickInboxFileFromList(platform, mode, [next])) {
        toast.error("This platform does not support that file type.");
        return;
      }
      setFile(next);
      setPreviewUrl(URL.createObjectURL(next));
    },
    [clearFile, mode, platform],
  );

  useEffect(() => {
    if (!sending) inFlightRef.current = false;
  }, [sending]);

  const submit = useCallback(() => {
    if (disabled || sending || inFlightRef.current) return;
    if (!draft.trim() && !file) return;
    inFlightRef.current = true;
    onSend({ text: draft.trim(), file, previewUrl });
    setDraft("");
    clearFile();
  }, [clearFile, disabled, draft, file, onSend, previewUrl, sending]);

  const canSend = Boolean(draft.trim() || file) && !disabled;

  return (
    <form
      className={cn(
        "relative bg-bg-elevated p-3 sm:p-4",
        variant === "default" && "border-t border-border",
        variant === "embedded" && "p-0",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => {
        if (!canAttach) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        if (!canAttach) return;
        e.preventDefault();
        setDragOver(false);
        const picked = pickInboxFileFromList(platform, mode, e.dataTransfer.files);
        if (picked) pickFile(picked);
        else if (e.dataTransfer.files.length) {
          toast.error("This platform does not support that file type.");
        }
      }}
    >
      {canAttach && dragOver ? (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
          Drop image or video
        </div>
      ) : null}

      {replyTo ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-bg-subtle px-2.5 py-1.5 text-[11px]">
          <span className="text-text-muted">
            Replying to{" "}
            <span className="font-medium text-text">{replyTo.name}</span>
          </span>
          <button
            type="button"
            onClick={replyTo.onClear}
            className="shrink-0 rounded-md font-medium text-text-muted transition-[transform,color,opacity] duration-150 ease-out hover:text-text active:scale-[0.97]"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {file && previewUrl ? (
        <div className="mb-2 flex items-start gap-2">
          {file.type.startsWith("video/") ? (
            <video
              src={previewUrl}
              className="h-16 w-16 rounded-md object-cover"
              muted
              playsInline
            />
          ) : (
            <img
              src={previewUrl}
              alt=""
              className="h-16 w-16 rounded-md object-cover"
            />
          )}
          <button
            type="button"
            onClick={clearFile}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-[transform,background-color,color] duration-150 ease-out hover:bg-bg-subtle hover:text-text active:scale-[0.97]"
            aria-label="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="flex gap-2">
        {canAttach ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full border border-border text-text-muted transition-[transform,background-color,color,opacity] duration-150 ease-out hover:bg-bg-subtle hover:text-text active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
              aria-label="Attach image or video"
            >
              <Paperclip size={18} />
            </button>
          </>
        ) : null}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            if (!canAttach) return;
            const picked = pickInboxFileFromClipboard(platform, mode, e.clipboardData);
            if (!picked) return;
            e.preventDefault();
            pickFile(picked);
          }}
          rows={2}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sending ? "Sending" : "Send"}
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full bg-accent text-accent-foreground transition-[transform,background-color,opacity,filter] duration-150 ease-out hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100",
          )}
        >
          {sending ? (
            <CircleNotch size={16} className="animate-spin" />
          ) : (
            <PaperPlaneTilt size={16} weight="fill" />
          )}
        </button>
      </div>
      <p className="mt-1.5 text-right text-[10px] tabular-nums text-text-muted">
        {draft.length}/{maxLength}
      </p>
    </form>
  );
}
