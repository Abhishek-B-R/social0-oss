/**
 * Agent-drafted replies (mock 09·A "AI draft ready").
 *
 * Not wired yet: there is no "pending reply" store on the server, so no
 * draft ever exists today. When one lands (e.g. MCP reply tools writing a
 * draft instead of sending), return it from `useInboxAiDraft` and the
 * `AiDraftCard` slot in both thread panes lights up. Nothing else changes.
 */
export type InboxAiDraft = {
  id: string;
  text: string;
  /** Source chip label, e.g. "Claude · MCP". */
  sourceLabel: string;
  createdAt?: string | null;
};

/** The waiting agent draft for an inbox item, or null. Always null today. */
export function useInboxAiDraft(itemKey: string | null): InboxAiDraft | null {
  void itemKey;
  return null;
}
