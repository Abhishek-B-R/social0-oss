/**
 * Shared dashboard UI kit. Import from "@/components/app".
 * See ./README.md for each export's props.
 */

// Layout & text
export { PageContainer } from "./PageContainer";
export { PageHeader } from "./PageHeader";
export { Banner } from "./Banner";
export { Kbd } from "./Kbd";

// Status vocabulary
export { StatusPill } from "./StatusPill";
export {
  PILL_STATUS_LABEL,
  toPillStatus,
  deliveryTone,
  deliverySummary,
  type PillStatus,
  type DeliveryTone,
} from "./status";
export { NetworkIcon, NetworkStack, type NetworkStackItem } from "./NetworkIcon";
export { networkLabel } from "./network";
export { SourceChip, SourceChipView } from "./SourceChip";
export {
  getPostSource,
  getPostSourceFromDto,
  isSelfSource,
  readPostSource,
  type PostSourceInfo,
  type PostSourceKind,
  type RawPostSource,
} from "./post-source";
export { usePostSource } from "./use-post-source";

// Navigation & URL state
export { Tabs, UrlTabs, type TabItem } from "./Tabs";
export { FilterChip, FilterChips, ClearFiltersButton, type FilterOption } from "./FilterChips";
export { useSearchParamState, useSearchParamList } from "./url-state";
export {
  useDashboardPath,
  useDashboardBasePath,
  dashboardPathFor,
  getDashboardRelativePath,
  useTeamId,
} from "./use-dashboard-path";

// Tables & selection
export {
  DataTable,
  DataTableHeader,
  DataTableBody,
  DataTableHead,
  DataTableRow,
  DataTableCell,
  SelectCheckbox,
  RowActions,
} from "./DataTable";
export { useRowSelection, type RowSelection } from "./use-row-selection";
export { FloatingBulkBar, BulkBarButton } from "./FloatingBulkBar";

// Surfaces & states
export { Drawer } from "./Drawer";
export { EmptyState, ErrorState, InlineError, type StateAction } from "./states";
export {
  Skeleton,
  SkeletonText,
  SkeletonRows,
  SkeletonCard,
  SkeletonPageHeader,
} from "./Skeletons";
export { Meter } from "./Meter";
export { Toggle } from "./Toggle";

// Keyboard, palette, composer
export { useHotkeys, type HotkeyBinding } from "./use-hotkeys";
export { useDashboardCommands, type Command, type CommandGroup } from "./use-dashboard-commands";
export {
  DASHBOARD_SHORTCUTS,
  formatShortcut,
  shortcutLabel,
  isMacPlatform,
  type ShortcutDef,
} from "./shortcuts";
export { CommandPalette } from "./CommandPalette";
export { ShortcutSheet } from "./ShortcutSheet";
export {
  openCommandPalette,
  closeCommandPalette,
  toggleCommandPalette,
  openShortcutSheet,
  closeShortcutSheet,
  useOverlayState,
} from "./overlay-bus";
export {
  openComposer,
  closeComposer,
  useComposerState,
  useComposerActive,
  registerPageComposer,
  isComposerPagePath,
  composerSearchParams,
  readComposerSearchParams,
  type ComposerOpenOptions,
  type ComposerModalProps,
  type ComposerState,
} from "./composer-bus";
export { ComposerHost } from "./ComposerHost";

// Data hooks
export {
  useAccountHealth,
  CONNECTED_ACCOUNTS_QUERY_KEY,
  type AccountWithHealth,
  type AccountHealth,
  type ConnectedAccount,
} from "./use-account-health";
export {
  useInboxNeedsReplyCount,
  useReportInboxNeedsReply,
  formatBadgeCount,
} from "./inbox-badge";
