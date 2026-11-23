import { useState } from "react";
import { Robot } from "@/icons/phosphor";
import type { InboxAiDraft } from "./ai-draft";

/**
 * Isolated slot for an agent-drafted reply. Renders nothing unless a draft
 * exists (none do yet, see `ai-draft.ts`). Drafts are never sent on their
 * own: the person edits in place, then Approve & send or Discard.
 */
export function AiDraftCard({
  draft,
  destination,
  sending,
  onApprove,
  onDiscard,
}: {
  draft: InboxAiDraft | null;
  /** Same "Reply as @brand on Instagram" line as the reply bar. */
  destination?: string | null;
  sending?: boolean;
  onApprove: (text: string) => void;
  onDiscard: () => void;
}) {
  if (!draft) return null;
  return (
    <AiDraftCardBody
      key={draft.id}
      draft={draft}
      destination={destination}
      sending={sending}
      onApprove={onApprove}
      onDiscard={onDiscard}
    />
  );
}

function AiDraftCardBody({
  draft,
  destination,
  sending,
  onApprove,
  onDiscard,
}: {
  draft: InboxAiDraft;
  destination?: string | null;
  sending?: boolean;
  onApprove: (text: string) => void;
  onDiscard: () => void;
}) {
  const [text, setText] = useState(draft.text);
  return (
    <section
      aria-label="Drafted reply, not sent"
      className="rounded-xl border border-dashed border-agent-border bg-agent-soft/60 p-3"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-agent">
          <Robot size={12} weight="fill" aria-hidden />
          Drafted by {draft.sourceLabel}
        </span>
        <span className="ml-auto text-xs text-text-muted">Not sent</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label="Edit drafted reply"
        className="mt-2 block w-full resize-none rounded-lg border border-transparent bg-transparent text-sm leading-relaxed text-text outline-none focus:border-agent-border focus:bg-bg-elevated focus:px-2 focus:py-1"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {destination ? (
          <p className="min-w-0 flex-1 truncate text-xs text-text-muted">{destination}</p>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex h-8 items-center rounded-lg border border-border bg-bg-elevated px-3 text-[13px] font-medium text-text hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={sending || !text.trim()}
          onClick={() => onApprove(text.trim())}
          className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[13px] font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Approve &amp; send
        </button>
      </div>
    </section>
  );
}
