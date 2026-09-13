import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * One pill in the "Post configurations & tools" row: clicking it opens its
 * panel, clicking it again closes it, and only one panel is open at a time.
 *
 * Every form wrote this button out per panel — ten near-identical copies whose
 * only real differences are the panel id, the label, and the status icon, which
 * each caller computes from its own state.
 */
export function ConfigPanelChip<Panel extends string>(props: {
  panel: Panel;
  activePanel: Panel | null;
  setActivePanel: Dispatch<SetStateAction<Panel | null>>;
  label: string;
  /** Status glyph on the left — a check, a warning, or a neutral dot. */
  icon: ReactNode;
  /** TikTok's chip keeps a 44px tap target on phones; the others do not. */
  largeTouchTarget?: boolean;
}) {
  const isOpen = props.activePanel === props.panel;
  return (
    <button
      type="button"
      onClick={() =>
        props.setActivePanel((p) => (p === props.panel ? null : props.panel))
      }
      className={`flex items-center gap-2 rounded-full border text-sm font-medium transition-colors shrink-0 ${
        props.largeTouchTarget
          ? "px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 touch-manipulation"
          : "px-3 py-1.5"
      } ${
        isOpen
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-bg-muted/50 text-text hover:bg-bg-subtle"
      }`}
    >
      {props.icon}
      <span>{props.label}</span>
      {isOpen ? (
        <ChevronUp className="h-3.5 w-3.5" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
