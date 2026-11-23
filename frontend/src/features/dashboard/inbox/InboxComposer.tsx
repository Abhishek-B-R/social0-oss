import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { CircleNotch, Paperclip, PaperPlaneTilt, X } from "@/icons/phosphor";
import { cn } from "@/lib/utils";
import {
  inboxMediaAccept,
  pickInboxFileFromClipboard,
  pickInboxFileFromList,
} from "@/lib/inbox-media";
import { toast } from "sonner";

export type InboxComposerPayload = {
  text: string;
  file?: File | null;
  previewUrl?: string | null;
};

/**
 * Reply bar pinned to the bottom of a thread. Names where the reply goes
 * ("Reply as @brand on Instagram"), takes an attachment where the network
 * allows one (pick, paste or drop), and sends with the button or ⌘/Ctrl+Enter.
 */
export function InboxComposer({
  platform,
  mode,
  maxLength,
  placeholder,
  disabled,
  sending,
  destination,
  replyTo,
  mediaKinds,
  inputRef,
  actions,
  onSend,
}: {
  platform: string;
  mode: "dm" | "comment";
  maxLength: number;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  /** "Reply as @brand on Instagram". */
  destination?: ReactNode;
  /** Which comment the reply targets, with a way back to the default. */
  replyTo?: { name: string; onClear?: () => void } | null;
  mediaKinds?: ("image" | "video")[] | null;
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Extra controls next to the destination line (like / hide). */
  actions?: ReactNode;
  onSend: (payload: InboxComposerPayload) => void;
}) {
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const accept = inboxMediaAccept(platform, mode, mediaKinds);
  const canAttach = Boolean(accept);

  // Blob URLs handed to onSend stay alive - the optimistic bubble renders them
  // and there is no signal back here when the server copy takes over. Anything
  // the user picked and then dropped is ours to revoke, or the File stays
  // pinned in memory for the life of the page.
  const sentUrls = useRef(new Set<string>());
  const livePreviewUrl = useRef<string | null>(null);

  const releasePreview = useCallback((url: string | null) => {
    if (!url || sentUrls.current.has(url)) return;
    URL.revokeObjectURL(url);
  }, []);

  const clearFile = useCallback(() => {
    releasePreview(livePreviewUrl.current);
    livePreviewUrl.current = null;
    setPreviewUrl(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [releasePreview]);

  useEffect(
    () => () => {
      releasePreview(livePreviewUrl.current);
    },
    [releasePreview],
  );

  const pickFile = useCallback(
    (next: File | null) => {
      clearFile();
      if (!next) return;
      if (!pickInboxFileFromList(platform, mode, [next], mediaKinds)) {
        toast.error("This network doesn't accept that file type here.");
        return;
      }
      const url = URL.createObjectURL(next);
      livePreviewUrl.current = url;
      setFile(next);
      setPreviewUrl(url);
    },
    [clearFile, mediaKinds, mode, platform],
  );

  useEffect(() => {
    if (!sending) inFlightRef.current = false;
  }, [sending]);

  const submit = useCallback(() => {
    if (disabled || sending || inFlightRef.current) return;
    if (!draft.trim() && !file) return;
    inFlightRef.current = true;
    if (previewUrl) sentUrls.current.add(previewUrl);
    onSend({ text: draft.trim(), file, previewUrl });
    setDraft("");
    clearFile();
  }, [clearFile, disabled, draft, file, onSend, previewUrl, sending]);

  const canSend = Boolean(draft.trim() || file) && !disabled && !sending;
  const nearLimit = draft.length >= maxLength * 0.9;

  return (
    <form
      className="relative shrink-0 border-t border-border bg-bg-elevated p-3 sm:p-4"
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
        const picked = pickInboxFileFromList(platform, mode, e.dataTransfer.files, mediaKinds);
        if (picked) pickFile(picked);
        else if (e.dataTransfer.files.length) {
          toast.error("This network doesn't accept that file type here.");
        }
      }}
    >
      {canAttach && dragOver ? (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent">
          Drop image or video
        </div>
      ) : null}

      {replyTo ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
          <span className="min-w-0 truncate">
            Replying to <span className="font-medium text-text">{replyTo.name}</span>
          </span>
          {replyTo.onClear ? (
            <button
              type="button"
              onClick={replyTo.onClear}
              className="shrink-0 rounded-md px-1 font-medium text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-bg px-3 pt-2 pb-2 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15">
        {file && previewUrl ? (
          <div className="mb-2 flex items-start gap-2">
            {file.type.startsWith("video/") ? (
              <video src={previewUrl} className="h-16 w-16 rounded-md object-cover" muted playsInline />
            ) : (
              <img src={previewUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
            )}
            <button
              type="button"
              onClick={clearFile}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              aria-label="Remove attachment"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
          onPaste={(e) => {
            if (!canAttach) return;
            const picked = pickInboxFileFromClipboard(platform, mode, e.clipboardData, mediaKinds);
            if (!picked) return;
            e.preventDefault();
            pickFile(picked);
          }}
          rows={2}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={placeholder}
          className="block min-h-[2.75rem] max-h-48 w-full resize-none bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-subtle disabled:opacity-60 [field-sizing:content]"
        />
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {destination ? (
            <p className="min-w-0 flex-1 truncate text-xs text-text-muted">{destination}</p>
          ) : (
            <span className="flex-1" />
          )}
          {actions}
          {canAttach ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-subtle hover:text-text disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10 touch:w-10"
                aria-label="Attach image or video"
                title="Attach image or video"
              >
                <Paperclip size={16} />
              </button>
            </>
          ) : null}
          {draft.length > 0 ? (
            <span
              className={cn(
                "text-xs tabular-nums",
                nearLimit ? "text-warning" : "text-text-subtle",
              )}
              aria-live="polite"
            >
              {draft.length}/{maxLength}
            </span>
          ) : null}
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-semibold text-accent-foreground transition-[background-color,opacity] hover:bg-accent-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 touch:h-10"
            title="Send (⌘/Ctrl + Enter)"
          >
            {sending ? (
              <CircleNotch size={14} className="animate-spin motion-reduce:animate-none" />
            ) : (
              <PaperPlaneTilt size={14} weight="fill" />
            )}
            {sending ? "Sending" : "Send"}
          </button>
        </div>
      </div>
    </form>
  );
}
