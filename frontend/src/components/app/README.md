# Dashboard UI kit (`@/components/app`)

Import everything from the barrel: `import { PageHeader, StatusPill } from "@/components/app"`.
All colors come from tokens in `src/index.css` (light + dark): `ok`, `warning` (`warning-solid` for fills), `danger`, `info`, `agent` (violet, AI agents), each with `-soft` (surface) and `-border`; plus `chip` and `scrim`. Use them as Tailwind classes: `text-warning bg-warning-soft border-warning-border`.

## Page layout contract (every dashboard page)
`DashboardLayout` owns the width and side padding: one column, max 1200px (1280px on 2xl), the same left edge on every page. Pages adopt it like this:

```tsx
<PageContainer stack>
  <PageHeader title="Accounts" actions={<Button>Connect account</Button>} />
  <section>…</section>
  <section>…</section>
</PageContainer>
```

- **PageContainer** `{ children, stack?, className? }` — the page's root. Adds no width of its own. `stack` puts 24px between direct children. **Never** wrap a page in `mx-auto max-w-*` (Accounts/Agents/Billing used `max-w-5xl` / `max-w-3xl`: delete those wrappers). Narrow reading content (a form) may cap its own width inside a section, left-aligned, never centered.
- **PageHeader** `{ title, subtitle?, actions?, breadcrumb?, children?, className? }` — the page's only `<h1>` (DM Sans 600 via `.dash-page-title`), always 24px above the content. `children` renders under it (tabs/filters).
  - No eyebrow. A small label repeating the section ("Calendar" over "October 2026", "Settings" over "Profile") is gone. `eyebrow` is deprecated: strings are ignored, elements render as `breadcrumb`. Switch to `breadcrumb`.
  - `breadcrumb` only on detail/sub-pages: "Posts › Failed", "← Automations".
  - `subtitle` only when it carries state ("1 post going out today · 3 scheduled"). No page descriptions ("Your plan, usage and invoices."), no "Takes about two minutes." / "Changes save on their own." (show a transient "Saved" instead).
  - `actions`: at most one filled primary per view; everything else ghost/outline.
- Settings keeps its two-column layout inside `PageContainer`; its top edge is the same as other pages because the header is a `PageHeader` at the top of the container.
- **Banner** `{ tier?: "blocking" | "info" | "danger", title?, children?, actions?, onDismiss?, dismissLabel?, icon?, className? }` — only blocking problems belong at page top.
- **Kbd** `{ keys?: string, children?: string, className? }` — `keys` uses shortcut syntax (`"mod+k"`, `"g h"`, `"?"`, `"enter"`) and renders ⌘/Ctrl correctly.

## Status vocabulary
- **StatusPill** `{ status: PillStatus, label?, size?: "sm"|"md", dot?=false, className? }` — soft tint, no border, 12px. `dot` is off by default (the color already says it). Healthy states get **no pill**: don't render `healthy`; for accounts show text only when something is wrong. `PillStatus`: `draft | needs_review | scheduled | publishing | published | partly_published | failed | healthy | sign_in_expired`.
- **toPillStatus**(raw, `{ isAgentDraft? }`) maps API statuses (`partial`, `posted`, `processing`, …) to a `PillStatus`. **deliveryTone**(raw) → `ok | failed | warning | pending | none`. **deliverySummary**(statuses[]) → `{ delivered, total, failed, label: "2 of 3 delivered" }`. **PILL_STATUS_LABEL** for copy.
- **NetworkIcon** `{ network, size?=16, className?, label? }` — 9 platforms (`linkedin facebook bluesky youtube pinterest instagram tiktok twitter_x threads`), labelled for screen readers (`label=""` = decorative). **networkLabel**(id) → "X", "TikTok"…
- **NetworkStack** `{ items: { network, status?, key?, hint? }[], size?=14, max?=6, dots?: "problems"|"all", className? }` — network icons. Default `dots="problems"`: only failed (red) / needs attention (amber) get a dot; `"all"` adds published/pending (live progress views). The tooltip always names the state.
- **getPostSourceFromDto**(dto, metadata?) → chip info from the server's resolved `source` (`PostSourceDto` in Home/Posts/Calendar payloads); falls back to `metadata.source`.
- **SourceChip** `{ post: { metadata?, createdByUserId? }, teammateName?, iconless?, showSelf?, className? }` — reads `metadata.source` `{ kind: "user"|"api_key"|"cli"|"mcp", keyName?, client?, userId?, userName? }`; labels teammate name, "ChatGPT · MCP", "CLI · <key>", "API · <key>". **Renders nothing for the signed-in user ("You")** unless `showSelf`. Agents: soft violet, no border; teammates: muted text. **SourceChipView** `{ source, showSelf? }` takes a resolved source (same rule).
- **isSelfSource**(source) → true for the current user's own posts. Use it to drop a whole Source column when every visible row is the user's, and to skip a "Source" property/label wrapper that would otherwise sit empty (`PostProperties`, `ActivityTimeline`, Home activity, calendar drawer).
- **usePostSource**(post, `{ teammateName? }`) → `{ kind, label, isAgent }`. Pure version: **getPostSource**(metadata, `{ currentUserId?, createdByUserId?, teammateName? }`). `isAgent && status === "draft"` means "Needs review".

## Navigation & URL state
- **useDashboardPath**() → `dash(suffix)`: `dash("posts?tab=failed")` → `/dashboard/posts?tab=failed` or `/dashboard/teams/:teamId/posts?tab=failed`. `dash()` = workspace home. billing/teams/workspaces/feedback/api-keys always resolve to personal. Never hard-code `/dashboard/...` for workspace pages. Also **useDashboardBasePath**, **dashboardPathFor**(base, suffix), **getDashboardRelativePath**(pathname), **useTeamId**().
- **Tabs** `{ items: { value, label, count?, tone?: "default"|"danger", disabled? }[], value, onChange, "aria-label", variant?: "underline"|"pill", idBase?, className? }` — arrow keys move. Counts render as plain muted numbers; `tone: "danger"` makes it red only when > 0 (Failed). **UrlTabs** same minus value/onChange plus `{ param?="tab", defaultValue, onValueChange? }`; default isn't written to the URL; changing resets `page`.
- **FilterChips** `{ param, options: { value, label, icon?, count?, tone?, title? }[], multiple?, allLabel?="All" | null, "aria-label", reset?=["page"], className? }` — state in the URL (`?network=instagram,tiktok` when `multiple`). **FilterChip** `{ selected, onClick, children, icon?, count?, tone?: "default"|"warning", title? }` for local state. **ClearFiltersButton** `{ active, onClear }`.
- **useSearchParamState**(key, default) → `[value, set(next|null, { push?, reset? })]`. **useSearchParamList**(key) → `[string[], set(list, opts)]`.

Shared URL names (`@/lib/dashboard-routes`): `POSTS_TABS` (`all drafts review scheduled published failed`), `AGENTS_TABS` (`agents keys webhooks`), `SETTINGS_SECTIONS` (`profile notifications security general schedule members billing workspaces`). Query params other pages link to and should honor: `connections?connect=1` (open connect modal; `?connect=<network>` opens its explainer), `connections?account=<id>` (open that account's drawer), `settings/members?invite=1` (open invite dialog), `posts?tab=…`, `agents?tab=agents|keys|webhooks`, `agents?client=chatgpt|claude|cursor|claude-code|api` (open that client's setup guide), `agents?tab=webhooks&webhook=<id>` (open that endpoint's drawer), `billing?view=plans`, `billing?upgrade=<creator|agency>` (opens plans and starts that upgrade; `?upgrade=1` or an old plan name just opens plans).

The workspace index (`/dashboard`, `/dashboard/teams/:teamId`) redirects to `home`, or to `connections` when an OAuth callback left `?error=` / `?connected=` / `?reauth=` (kept on the URL).

## Tables & selection
- **DataTable** `{ children, "aria-label"?, className?, tableClassName? }` with **DataTableHeader**, **DataTableBody**, **DataTableHead** (th), **DataTableCell** (td) — normal HTML props. Headers are sentence case, 12px, muted, no tint: write labels as "Last post", never "LAST POST", and don't add `uppercase`/`tracking-*`. Body text stays 13–14px; meta 12px.
- **DataTableRow** `{ selected?, onActivate?, tone?: "default"|"danger"|"warning"|"muted", ...trProps }` — `onActivate` makes the row clickable/Enter-able; clicks on links/buttons/inputs/`[data-row-stop]` are ignored. Carries `group/row` for `RowActions`.
- **RowActions** `{ children, visible?, className? }` — row-level actions shown on row hover / focus-within (and always on touch and on selected rows). Pass `visible` on problem rows so Retry / Reconnect never hide. Use quiet (ghost/text) buttons inside. Outside `DataTableRow`, give the row element `className="group/row"`. Example: `<DataTableCell><RowActions visible={failed}>{failed ? <RetryButton/> : <Link>View</Link>}</RowActions></DataTableCell>`.
- **SelectCheckbox** `{ checked, indeterminate?, onToggle({ range }), label }` — shift-click passes `range: true`.
- **useRowSelection**(ids) → `{ selectedIds, count, isSelected, toggle(id, { range? }), toggleAll, clear, allSelected, someSelected }`.
- **FloatingBulkBar** `{ count, onClear, children, noun?="item" }` (hidden at 0, Esc clears) with **BulkBarButton** `{ onClick, children, tone?: "default"|"primary"|"danger", icon?, disabled? }`.

## Surfaces & states
- **Drawer** `{ open, onOpenChange, title, description?, headerActions?, footer?, width?: "sm"|"md"|"lg"|"xl", preventAutoFocus?, children, className? }` — right sheet on Radix Dialog; full width on phones.
- **EmptyState** `{ title, description?, icon?, primaryAction?, secondaryAction?, compact?, className? }`; actions are `{ label, href?, onClick?, icon? }`. Inside cards, drawers, tables and sections always use `compact`: one left-aligned line ("Nothing scheduled today." + text-link action), no icon, no box. The full (centered) variant is only for a whole empty page.
- **ErrorState** `{ message, detail?, onRetry, retrying?, compact?, className? }` — always has Retry. **InlineError** `{ message, onRetry? }` for one-liners.
- **Skeleton** (div props), **SkeletonText** `{ lines? }`, **SkeletonRows** `{ rows?, thumbnail? }`, **SkeletonCard** `{ lines? }`, **SkeletonPageHeader**.
- **Meter** `{ value, max, label?, hint?, tone?: "auto"|"default"|"warning"|"danger", size?: "xs"|"sm"|"md" }` — auto: amber ≥90%, red at limit. `xs` is a 2px hairline with a muted 12px label (sidebar plan meter).
- **Toggle** `{ checked, onCheckedChange, label?, description?, disabled?, pending?, "aria-label"? }` — `role="switch"`; with `label` it renders a settings row.

## Keyboard, palette, composer
- **useHotkeys**(bindings, `{ enabled? }`) — binding `{ keys, handler, enabled?, allowInInputs?, allowInDialogs?, preventDefault? }`. Plain keys never fire while typing (unless allowed); `mod+` combos do. Nothing fires while a dialog is open unless `allowInDialogs` (⌘K only toggles the palette / leaves the shortcut sheet). The key right after a sequence prefix (the `p` of "g p") never fires another instance's plain-key binding. Global bindings (⌘K, C, ?, G then H/I/C/P/A) live in `components/dashboard/DashboardHotkeys.tsx`; bind page keys (J/K/R…) in the page.
- **DASHBOARD_SHORTCUTS** feeds the `?` sheet — add page shortcuts there when you bind them. **formatShortcut**, **shortcutLabel**, **isMacPlatform**.
- **CommandPalette** / **ShortcutSheet** are mounted once by the layout. Open them with **openCommandPalette**(query?), **toggleCommandPalette**, **openShortcutSheet** (and `close*`). The palette has no visible trigger (owner's call): ⌘K / Ctrl+K only.
- **openComposer**(`{ text?, scheduledAt?: string|Date, queueSlotId?, accounts?: string[], intent?: "schedule" | "now" }`) opens the composer modal from anywhere. It does nothing while a composer is already up (the modal, or the full-page `/new`, which calls **registerPageComposer**()); **useComposerActive**() tells entry points when to hide, **isComposerPagePath**(relativePath) matches the full-page routes. Pass `queueSlotId` with `scheduledAt` when the time is a queue slot (calendar ghost slots) so the post books that slot. **ComposerHost** (mounted by the layout) lazy-loads `@/features/dashboard/create/ComposerModal` (named **`ComposerModal`**, **`ComposerModalProps`** `{ open, options, nonce, onClose }`). **composerSearchParams**(opts) / **readComposerSearchParams**(URLSearchParams) carry the same prefill in the `/new` URL (`?text=&at=&slot=&accounts=&intent=`).
- **PublishTray** (`features/dashboard/publish/PublishTray`) is mounted once by the layout: publishes report there after the composer closes or the page changes.

## Plan limits
- **LimitModal** / **useLimitModal** (`@/components/billing/LimitModal`, `@/components/billing/use-limit-modal`) are the one way to show a plan-limit moment: `const { openLimit, limitModal } = useLimitModal()`, render `{limitModal}` once, call `openLimit("accounts" | "free_posts" | "bulk_tools" | "autoplug" | "resurface" | "teams" | "workspaces", { used? })`. Wired at: connect over the account limit (Accounts), free posts used up (composer), teams (Create team, Settings → Members), workspaces (switcher "New workspace", All workspaces). Locked pages (Automations, Bulk import) render `LockedPlanPanel` instead of redirecting.

## Data hooks
- **useAccountHealth**(`{ enabled? }`) → `{ accounts: (account & { health: "healthy"|"expired"|"inactive", handle, reconnectHref })[], broken, accountLimit, canManageConnections, canAccessBilling, isLoading, isError, refetch }`. Query key **CONNECTED_ACCOUNTS_QUERY_KEY** (`["connections", "page-data"]`, invalidated on workspace switch). Reconnect is a full navigation: `<a href={a.reconnectHref}>`. URL builder alone: `reconnectUrl` in `@/lib/account-reconnect`.
- **useInboxNeedsReplyCount**() → last needs-reply count the Inbox page computed for this workspace (this tab), or `null` when unknown; nav badges hide on null/0. The Inbox reports it with **useReportInboxNeedsReply**(count | null) (null = leave the last value). **formatBadgeCount**(n) → "3" / "99+".
- Plan names: `planName(tier)` / `planLabel(tier)` in `@/lib/plan-name`, backed by `PLAN_NAMES` in `@/lib/plans` (the only place names are spelled). Sold: Creator, Agency. Starter, Growth, Pro, Max are legacy: shown to the customers on them, never offered. Agency has no account picker: accounts above 59 are billed as they connect (`AGENCY_EXTRA_ACCOUNT_NOTE` in `@/lib/plan-pricing`).

## Section entry points (built; keep the export names)
| Route | File | Export |
| --- | --- | --- |
| `home` | `features/dashboard/home/HomePage.tsx` | `HomePage` |
| `new` (also `composer`, `create`, `create/:type`) | `features/dashboard/create/NewPostPage.tsx` | `NewPostPage` (`startAsThread` for `/create/threads`) |
| composer modal | `features/dashboard/create/ComposerModal.tsx` | `ComposerModal` (`ComposerModalProps`) |
| `automations` | `features/dashboard/automations/AutomationsPage.tsx` | `AutomationsPage` |
| `bulk-tools`, `bulk-tools/image`, `bulk-tools/video` | `features/dashboard/bulk-tools/BulkImportPage.tsx` | `BulkImportPage` (`scope` mixed / image / video) |
| `agents?tab=` | `features/dashboard/api-keys/AgentsPage.tsx` | `AgentsPage` |
| `settings`, `settings/:section`, `teams/:teamId/settings[/:section]` | `features/dashboard/settings/SettingsShell.tsx` | `SettingsShell` |

## Reserved exports
Built for sections but not used by any page yet; prefer them over new local copies: **SourceChip** / **usePostSource** (pages currently resolve sources themselves and render **SourceChipView**), **PageContainer** / **RowActions** / **isSelfSource** (polish pass: adopt them), **deliverySummary** (list copy "N of M delivered"; Post detail intentionally says "N of M live"), **useSearchParamList**, **composerSearchParams**.

## Polish rules the kit already applies (don't re-add locally)
- No borders on status pills, no leading dots, no uppercase tracked labels (tables, menus, sidebar groups, palette groups).
- No chip for the current user; no green "healthy" dots or pills. Problems only.
- Sidebar Accounts: max 5 rows, problem accounts first, then "All accounts (n)"; amber dot only on expired accounts (grey on paused); "Reconnect" text appears on hover/focus. Plan meter is a thin line at ≥70% of the account limit, or on Free.
- Keyboard shortcuts live in tooltips (`title`) and the `?` sheet, never in a footer legend on a page.
- Don't nest bordered boxes inside bordered cards: use spacing and a divider.
