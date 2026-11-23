import { useCallback, useState } from "react";
import { LimitModal, type LimitModalProps } from "./LimitModal";
import type { LimitReason } from "./limit-reasons";

type OpenLimitOptions = Omit<LimitModalProps, "open" | "onOpenChange" | "reason">;

/**
 * Convenience wrapper: `const { openLimit, limitModal } = useLimitModal();`
 * then render `{limitModal}` once and call `openLimit("accounts", { used: 5 })`.
 */
export function useLimitModal(defaults?: OpenLimitOptions) {
  const [state, setState] = useState<{
    open: boolean;
    reason: LimitReason;
    opts: OpenLimitOptions;
  }>({ open: false, reason: "accounts", opts: {} });

  const openLimit = useCallback((reason: LimitReason, opts: OpenLimitOptions = {}) => {
    setState({ open: true, reason, opts });
  }, []);
  const closeLimit = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const limitModal = (
    <LimitModal
      {...defaults}
      {...state.opts}
      reason={state.reason}
      open={state.open}
      onOpenChange={(o) => (o ? undefined : closeLimit())}
    />
  );

  return { openLimit, closeLimit, limitModal, isOpen: state.open };
}
