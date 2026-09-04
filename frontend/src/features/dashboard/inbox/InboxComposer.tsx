import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  avatar,
  replyTo,
  mediaKinds,
  onSend,
}: {
  platform: string;
  mode: "dm" | "comment";
  maxLength: number;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  initialText?: string;
  variant?: "default" | "embedded" | "thread";
  avatar?: ReactNode;
  replyTo?: { name: string; onClear: () => void } | null;
  mediaKinds?: ("image" | "video")[] | null;
  onSend: (payload: InboxComposerPayload) => void;
}) {
  const [draft, setDraft] = useState(initialText);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const accept = inboxMediaAccept(platform, mode, mediaKinds);
  const canAttach = Boolean(accept);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- parent remounts on target change
    setDraft(initialText);
  }, [initialText]);

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
    if (inputRef.current) inputRef.current.value = "";
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
        toast.error("This platform does not support that file type.");
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

  const canSend = Boolean(draft.trim() || file) && !disabled;
  const isThread = variant === "thread";

  const attachControl = canAttach ? (
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
        className={cn(
          "inline-flex shrink-0 items-center justify-center text-text-muted transition-[transform,background-color,color,opacity] duration-150 ease-out hover:text-text active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100",
          isThread
            ? "h-8 w-8 rounded-full hover:bg-bg-subtle"
            : "h-10 w-10 self-end rounded-full border border-border hover:bg-bg-subtle",
        )}
        aria-label="Attach image or video"
      >
        <Paperclip size={isThread ? 16 : 18} />
      </button>
    </>
  ) : null;

  const preview = file && previewUrl ? (
    <div className="mb-2 flex items-start gap-2">
      {file.type.startsWith("video/") ? (
        <video
          src={previewUrl}
          className="h-16 w-16 rounded-md object-cover"
          muted
          playsInline
        />
      ) : (
        <img src={previewUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
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
  ) : null;

  return (
    <form
      className={cn(
        "relative bg-bg-elevated",
        variant === "default" && "border-t border-border p-3 sm:p-4",
        variant === "embedded" && "p-0",
        isThread && "bg-transparent p-0",
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
        const picked = pickInboxFileFromList(platform, mode, e.dataTransfer.files, mediaKinds);
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

      {isThread ? (
        <div className="flex gap-2.5">
          {avatar ? <div className="shrink-0 pt-1">{avatar}</div> : null}
          <div className="min-w-0 flex-1">
            {replyTo ? (
              <p className="mb-1.5 text-[11px] text-text-muted">
                Replying to{" "}
                <span className="font-medium text-text">{replyTo.name}</span>
              </p>
            ) : null}
            {preview}
            <div className="rounded-2xl border border-black/[0.08] bg-bg-elevated px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-accent/40 dark:border-white/[0.1]">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  if (!canAttach) return;
                  const picked = pickInboxFileFromClipboard(
                    platform,
                    mode,
                    e.clipboardData,
                    mediaKinds,
                  );
                  if (!picked) return;
                  e.preventDefault();
                  pickFile(picked);
                }}
                rows={3}
                maxLength={maxLength}
                placeholder={placeholder}
                disabled={disabled}
                className="min-h-[4.5rem] w-full resize-none bg-transparent text-[14px] leading-relaxed text-text outline-none placeholder:text-text-muted disabled:opacity-60"
              />
              <div className="mt-1 flex items-center gap-1">
                {attachControl}
                <span className="ml-auto text-[10px] tabular-nums text-text-muted">
                  {draft.length}/{maxLength}
                </span>
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label={sending ? "Sending" : "Send"}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-[transform,background-color,opacity] duration-150 ease-out hover:bg-accent-hover active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
                >
                  {sending ? (
                    <CircleNotch size={14} className="animate-spin" />
                  ) : (
                    <PaperPlaneTilt size={14} weight="fill" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
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
          {preview}
          <div className="flex gap-2">
            {attachControl}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                if (!canAttach) return;
                const picked = pickInboxFileFromClipboard(
                  platform,
                  mode,
                  e.clipboardData,
                  mediaKinds,
                );
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
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full bg-accent text-accent-foreground transition-[transform,background-color,opacity,filter] duration-150 ease-out hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
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
        </>
      )}
    </form>
  );
}
