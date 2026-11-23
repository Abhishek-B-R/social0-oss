import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Users } from "lucide-react";
import { toast } from "sonner";
import { createPost } from "@/api/posts";
import { AccountAvatar } from "@/components/AccountAvatar";
import Link from "@/components/AppLink";
import {
  NetworkIcon,
  networkLabel,
  openComposer,
  shortcutLabel,
  useAccountHealth,
  useDashboardPath,
} from "@/components/app";
import { REMEMBERED_ACCOUNT_KEYS, useRememberedAccounts } from "@/lib/remembered-accounts";
import { cn } from "@/lib/utils";
import { formatTz, dayKey, timePattern } from "./home-format";
import { HOME_QUERY_KEY, useNextQueueSlot } from "./use-home-data";
import { useDismiss } from "./use-dismiss";

function draggingFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

/** Images / videos on the clipboard (a pasted screenshot), never plain text. */
function pastedMedia(e: ClipboardEvent): File[] {
  const out: File[] = [];
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f && (f.type.startsWith("image/") || f.type.startsWith("video/"))) out.push(f);
  }
  return out;
}

function slotLabel(at: string, timezone: string, today: string, use24h: boolean): string {
  const time = formatTz(at, timezone, timePattern(use24h));
  if (dayKey(at, timezone) === today) return time;
  const tomorrow = dayKey(new Date(new Date(at).getTime() - 86_400_000), timezone) === today;
  return tomorrow ? `Tomorrow ${time}` : `${formatTz(at, timezone, "EEE")} ${time}`;
}

/**
 * Home's one-line composer. Typing and pressing Enter (or the main button)
 * opens the full composer prefilled with the text and the remembered
 * accounts. The main button reads "Add to queue · <next slot>" when a queue
 * exists and the composer opens on that same queue action; "Publish now…"
 * opens it with Publish now as the primary action instead.
 */
export function QuickCompose({
  timezone,
  today,
  canPublish,
  use24h,
}: {
  timezone: string;
  today: string;
  canPublish: boolean;
  use24h: boolean;
}) {
  const dash = useDashboardPath();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const { accounts, isLoading: accountsLoading } = useAccountHealth();
  const usable = useMemo(
    () => accounts.filter((a) => a.health === "healthy"),
    [accounts],
  );
  const remembered = useRememberedAccounts(REMEMBERED_ACCOUNT_KEYS.composer);
  const selected = useMemo(() => {
    const valid = new Set(usable.map((a) => a.id));
    if (!remembered.remember) return [] as string[];
    return remembered.rememberedAccountIds.filter((id) => valid.has(id));
  }, [usable, remembered.remember, remembered.rememberedAccountIds]);
  const selectedAccounts = usable.filter((a) => selected.includes(a.id));

  const slotQuery = useNextQueueSlot(canPublish);
  const slot = slotQuery.data ?? null;

  const closePicker = useCallback(() => setPickerOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(pickerOpen, closePicker, pickerRef, pickerButtonRef);
  useDismiss(menuOpen, closeMenu, menuRef, menuButtonRef);

  const toggleAccount = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    remembered.setRememberAndSelection(true, next);
  };

  const prefill = () => ({
    text: text.trim() || undefined,
    accounts: selected.length ? selected : undefined,
  });

  const openWith = (extra?: Parameters<typeof openComposer>[0]) => {
    openComposer({ ...prefill(), ...extra });
    setText("");
    setMenuOpen(false);
  };

  // No time is passed for the queue: the composer books its own next free
  // slot, so its button reads "Add to queue · <slot>" (a fixed time would
  // turn it into "Schedule · <time>").
  const primary = () => openWith();

  // Dropping or pasting media hands it to the full composer with the text
  // and accounts so far; the composer runs its usual size/type checks.
  const onDragOver = (e: DragEvent<HTMLFormElement>) => {
    if (!draggingFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLFormElement>) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLFormElement>) => {
    if (!draggingFiles(e)) return;
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) openWith({ files });
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = pastedMedia(e);
    if (files.length === 0) return;
    e.preventDefault();
    openWith({ files });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    primary();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      primary();
    }
  };

  const saveDraft = async () => {
    const content = text.trim();
    if (!content || selected.length === 0) return;
    setSavingDraft(true);
    setMenuOpen(false);
    try {
      const res = await createPost(content, selected, "draft", null, [], {
        contentType: "text",
      });
      if (!res.success) {
        toast.error(res.error || "Couldn't save the draft. Try again.");
        return;
      }
      setText("");
      void queryClient.invalidateQueries({ queryKey: HOME_QUERY_KEY });
      toast.success("Draft saved", {
        action: {
          label: "Open",
          onClick: () => navigate(dash(`posts/${res.postId}`)),
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the draft. Try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  const pickerLabel = accountsLoading
    ? "Loading accounts"
    : selectedAccounts.length
      ? `Posting to ${selectedAccounts.length} account${selectedAccounts.length === 1 ? "" : "s"}: ${selectedAccounts.map((a) => a.handle).join(", ")}. Change accounts`
      : "Pick accounts";

  // The viewer's zone, like `today` and the rest of Home. In a team the slot's
  // own zone is the owner's, and mixing the two mislabels the day.
  const primaryLabel =
    canPublish && slot
      ? `Add to queue · ${slotLabel(slot.scheduledAt, timezone, today, use24h)}`
      : "New post";

  const draftDisabledReason = !text.trim()
    ? "Write something first"
    : selected.length === 0
      ? "Pick at least one account"
      : null;

  return (
    <form
      onSubmit={onSubmit}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Quick post"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-elevated p-2 pl-3 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15 sm:flex-nowrap",
        dragOver && "border-dashed border-accent ring-2 ring-accent/15",
      )}
    >
      <label htmlFor="home-quick-compose" className="sr-only">
        Post something quick
      </label>
      <textarea
        id="home-quick-compose"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={dragOver ? "Drop to add to a new post" : "Post something quick…"}
        title="Type, paste or drop images and video"
        className="min-h-9 min-w-0 flex-1 basis-full resize-none bg-transparent py-2 text-sm text-text placeholder:text-text-subtle focus:outline-none sm:basis-auto [field-sizing:content] max-h-32"
      />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Accounts (remembered per browser, shared with the composer) */}
        <div className="relative" ref={pickerRef}>
          <button
            ref={pickerButtonRef}
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={pickerOpen}
            aria-label={pickerLabel}
            title={pickerLabel}
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium tabular-nums transition-colors hover:bg-bg-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              selectedAccounts.length ? "text-text" : "text-text-muted",
            )}
          >
            <Users className="size-4" aria-hidden />
            {selectedAccounts.length ? <span>{selectedAccounts.length}</span> : null}
          </button>
          {pickerOpen ? (
            <div
              role="group"
              aria-label="Accounts to post to"
              className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-border bg-bg-elevated p-1 shadow-lg"
            >
              {usable.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-text-muted">
                  No accounts ready to post.{" "}
                  <Link
                    href={dash("connections?connect=1")}
                    onClick={() => setPickerOpen(false)}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Connect one
                  </Link>
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto">
                  {usable.map((a) => {
                    const on = selected.includes(a.id);
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleAccount(a.id)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-text hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none"
                        >
                          <span className="relative">
                            <AccountAvatar
                              profileImageUrl={a.profileImageUrl}
                              username={a.platformUsername}
                              platform={a.platform}
                              size="sm"
                              className="!size-6"
                            />
                            <NetworkIcon
                              network={a.platform}
                              size={11}
                              label=""
                              className="absolute -bottom-0.5 -right-1 rounded-full bg-bg-elevated p-px"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{a.handle}</span>
                            <span className="block text-xs text-text-muted">
                              {networkLabel(a.platform)}
                            </span>
                          </span>
                          <Check
                            aria-hidden
                            className={cn("size-4 text-accent", on ? "opacity-100" : "opacity-0")}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="border-t border-border px-3 py-2 text-xs text-text-muted">
                Remembered for next time.
              </p>
            </div>
          ) : null}
        </div>

        {/* Split button */}
        <div className="relative flex" ref={menuRef}>
          <button
            type="submit"
            title={`Opens the composer (${shortcutLabel("c")} from anywhere)`}
            className={cn(
              "inline-flex h-9 items-center whitespace-nowrap bg-accent px-3.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11",
              canPublish ? "rounded-l-lg" : "rounded-lg",
            )}
          >
            {savingDraft ? "Saving…" : primaryLabel}
          </button>
          {canPublish ? (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More ways to post"
              className="inline-flex h-9 items-center rounded-r-lg border-l border-accent-foreground/20 bg-accent px-2 text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-11"
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          ) : null}
          {menuOpen ? (
            <div
              role="menu"
              aria-label="More ways to post"
              className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-border bg-bg-elevated p-1 shadow-lg"
            >
              <MenuItem onClick={() => openWith({ intent: "now" })}>Publish now…</MenuItem>
              <MenuItem onClick={() => openWith({ intent: "schedule" })}>Schedule…</MenuItem>
              <MenuItem
                onClick={() => void saveDraft()}
                disabled={!!draftDisabledReason || savingDraft}
                hint={draftDisabledReason ?? undefined}
              >
                Save as draft
              </MenuItem>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function MenuItem({
  onClick,
  disabled,
  hint,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
  children: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <span>{children}</span>
      {hint ? <span className="text-xs text-text-muted">{hint}</span> : null}
    </button>
  );
}
