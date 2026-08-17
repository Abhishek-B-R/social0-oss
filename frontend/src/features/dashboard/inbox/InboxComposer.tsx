import { useCallback, useRef, useState } from "react";
import { CircleNotch, Paperclip, PaperPlaneTilt, X } from "@/icons/phosphor";
import { cn } from "@/lib/utils";
import { inboxMediaAccept } from "@/lib/inbox-media";
import {
  pickInboxFileFromClipboard,
  pickInboxFileFromList,
} from "@/lib/inbox-pick-file";
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
  onSend,
}: {
  platform: string;
  mode: "dm" | "comment";
  maxLength: number;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  onSend: (payload: InboxComposerPayload) => void;
}) {
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = inboxMediaAccept(platform, mode);
  const canAttach = Boolean(accept);

  const clearFile = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
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

  const submit = useCallback(() => {
    if (disabled || sending) return;
    if (!draft.trim() && !file) return;
    onSend({ text: draft.trim(), file, previewUrl });
    setDraft("");
    clearFile();
  }, [clearFile, disabled, draft, file, onSend, previewUrl, sending]);

  const canSend = Boolean(draft.trim() || file) && !disabled;

  return (
    <form
      className="relative border-t border-border bg-bg-elevated p-3 sm:p-4"
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-text"
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
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg border border-border text-text-muted hover:bg-bg-subtle hover:text-text disabled:opacity-50"
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
          placeholder={
            canAttach
              ? `${placeholder} · Paste or drop media`
              : placeholder
          }
          disabled={disabled}
          className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sending ? "Sending" : "Send"}
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50",
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
