import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "./Kbd";
import { closeShortcutSheet, useOverlayState } from "./overlay-bus";
import { DASHBOARD_SHORTCUTS, type ShortcutDef } from "./shortcuts";

const GROUP_ORDER: ShortcutDef["group"][] = ["General", "Go to", "New post", "Lists", "Calendar", "Inbox"];

/** `?` sheet listing every dashboard shortcut. Mount once (DashboardLayout). */
export function ShortcutSheet() {
  const { shortcuts: open } = useOverlayState();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeShortcutSheet();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts don’t fire while you’re typing in a field.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {GROUP_ORDER.map((group) => {
            const items = DASHBOARD_SHORTCUTS.filter((s) => s.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group}>
                <h3 className="mb-2 text-xs font-medium text-text-muted">
                  {group}
                </h3>
                <ul className="space-y-1.5">
                  {items.map((s) => (
                    <li
                      key={s.keys}
                      className="flex items-center justify-between gap-3 text-sm text-text"
                    >
                      <span>{s.description}</span>
                      <Kbd keys={s.keys} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
