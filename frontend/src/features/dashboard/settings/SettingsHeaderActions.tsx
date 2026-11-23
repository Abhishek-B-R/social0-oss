import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SettingsHeaderSlotContext } from "./header-slot-context";

/**
 * Renders a section's primary action (New workspace, Invite people) in the
 * settings page header, beside the title. Outside the settings shell it
 * renders in place, wrapped in `fallbackClassName`.
 */
export function SettingsHeaderActions({
  children,
  fallbackClassName,
}: {
  children: ReactNode;
  fallbackClassName?: string;
}) {
  const ctx = useContext(SettingsHeaderSlotContext);
  if (!ctx) return <div className={fallbackClassName}>{children}</div>;
  if (!ctx.slot) return null;
  return createPortal(children, ctx.slot);
}
