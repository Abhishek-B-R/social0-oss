import { useRef, useState } from "react";
import { Paperclip, PaperPlaneTilt, X } from "@/icons/phosphor";
import { cn } from "@/lib/utils";
import { inboxAcceptsFile, inboxMediaAccept } from "@/lib/inbox-media";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = inboxMediaAccept(platform, mode);
  const canAttach = Boolean(accept);

  function clearFile() {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function pickFile(next: File | null) {
    clearFile();
    if (!next) return;
    if (!inboxAcceptsFile(platform, mode, next)) return;
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  }

  const canSend = Boolean(draft.trim() || file) && !disabled && !sending;

  return (
    <form
      className="border-t border-border bg-bg-elevated p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSend) return;
        onSend({ text: draft.trim(), file, previewUrl });
        setDraft("");
        clearFile();
      }}
    >
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
              disabled={disabled || sending}
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
          rows={2}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled || sending}
          className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50",
          )}
        >
          <PaperPlaneTilt size={16} weight="fill" />
        </button>
      </div>
      <p className="mt-1.5 text-right text-[10px] tabular-nums text-text-muted">
        {draft.length}/{maxLength}
      </p>
    </form>
  );
}
