import { useLocation, useNavigate } from "react-router-dom";
import { getDashboardRelativePath } from "@/lib/dashboard-base-path";
import {
  CommandPalette,
  ShortcutSheet,
  isComposerPagePath,
  openComposer,
  openShortcutSheet,
  toggleCommandPalette,
  useDashboardPath,
  useHotkeys,
  useOverlayState,
} from "@/components/app";

/**
 * Dashboard-wide shortcuts + the palette and shortcut sheet they open.
 * ⌘K/Ctrl+K palette · C new post · ? shortcuts · G then H/I/C/P/A.
 */
export function DashboardHotkeys({
  canCreatePosts,
  canViewInbox,
  canViewAnalytics,
}: {
  canCreatePosts: boolean;
  canViewInbox: boolean;
  canViewAnalytics: boolean;
}) {
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const { pathname } = useLocation();
  // Already on the full-page composer: C shouldn't stack a modal on top.
  const onComposerPage = isComposerPagePath(getDashboardRelativePath(pathname));
  // ⌘K never opens over another dialog (the legal consent gate, the
  // composer, a drawer): only over nothing, or to toggle the palette itself
  // and to hop from the shortcut sheet to the palette.
  const { palette, shortcuts } = useOverlayState();

  useHotkeys([
    {
      keys: "mod+k",
      handler: () => toggleCommandPalette(),
      allowInInputs: true,
      allowInDialogs: palette || shortcuts,
    },
    { keys: "c", handler: () => openComposer(), enabled: canCreatePosts && !onComposerPage },
    { keys: "?", handler: () => openShortcutSheet() },
    { keys: "g h", handler: () => navigate(dash("home")) },
    { keys: "g i", handler: () => navigate(dash("inbox")), enabled: canViewInbox },
    { keys: "g c", handler: () => navigate(dash("calendar")) },
    { keys: "g p", handler: () => navigate(dash("posts")) },
    { keys: "g a", handler: () => navigate(dash("analytics")), enabled: canViewAnalytics },
  ]);

  return (
    <>
      <CommandPalette />
      <ShortcutSheet />
    </>
  );
}
