import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileText, Search, SquarePen } from "lucide-react";
import { loadPostsPageData } from "@/api/dashboard-data";
import { useWorkspaceNavPermissions } from "@/hooks/useWorkspaceNavPermissions";
import { cn } from "@/lib/utils";
import { openComposer, useComposerActive } from "./composer-bus";
import { Kbd } from "./Kbd";
import { closeCommandPalette, openShortcutSheet, useOverlayState } from "./overlay-bus";
import { StatusPill } from "./StatusPill";
import { toPillStatus } from "./status";
import { useDashboardCommands, type Command } from "./use-dashboard-commands";
import { useDashboardPath, useTeamId } from "./use-dashboard-path";

const MAX_POSTS = 6;
/** Shortest query that hits the server-side caption search. */
const MIN_SEARCH_CHARS = 2;
/** Typing pause before the caption search hits the server. */
const SEARCH_DEBOUNCE_MS = 250;

function matches(haystack: string, query: string): boolean {
  const h = haystack.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => h.includes(word));
}

function firstLine(text: string | null): string {
  const line = (text ?? "").split("\n").find((l) => l.trim()) ?? "";
  return line.trim() || "Untitled post";
}

type Row =
  | { kind: "command"; command: Command }
  | {
      kind: "post";
      id: string;
      label: string;
      status: string | null;
      run: () => void;
    };

/**
 * ⌘K palette: actions, navigation and post search. Keyboard only (no
 * visible trigger in the sidebar, per owner). Unknown text becomes
 * "Create post with this text". Mount once (DashboardLayout).
 */
export function CommandPalette() {
  const { palette: open, paletteQuery } = useOverlayState();
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) closeCommandPalette();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="palette-overlay"
          className="fixed inset-0 z-[60] bg-scrim"
        />
        <DialogPrimitive.Content
          data-slot="palette-content"
          aria-describedby={undefined}
          className="fixed left-1/2 top-[max(1rem,12vh)] z-[60] flex max-h-[min(32rem,76vh)] w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated text-text shadow-[0_24px_64px_-16px_rgba(0,0,0,0.45)] outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          {/* Radix unmounts Content when closed, so the body (query,
              selection) starts fresh on every open and stays visible
              during the exit animation. */}
          <PaletteBody initialQuery={paletteQuery} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query.trim());
  // Server search waits for a pause in typing; local filtering stays instant.
  const [searchTerm, setSearchTerm] = useState(() => initialQuery.trim());
  useEffect(() => {
    const next = query.trim();
    const t = window.setTimeout(() => setSearchTerm(next), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const commands = useDashboardCommands();
  const perms = useWorkspaceNavPermissions();
  // Same rule as the "New post" command: nothing to open over a composer.
  const composerActive = useComposerActive();
  const canCompose = (!perms.ready || perms.canCreatePosts) && !composerActive;

  const workspaceKey = useTeamId() ?? "personal";

  // Recent posts: shown with an empty query and filtered locally while typing.
  const postsQuery = useQuery({
    queryKey: ["command-palette", workspaceKey, "recent-posts"],
    queryFn: () => loadPostsPageData({ page: 1, sort: "newest", includeCounts: false }),
    staleTime: 30_000,
  });
  // Caption search across every post (older ones aren't in the recent page).
  const searching = searchTerm.length >= MIN_SEARCH_CHARS;
  const searchQuery = useQuery({
    queryKey: ["command-palette", workspaceKey, "search", searchTerm],
    queryFn: () =>
      loadPostsPageData({ page: 1, sort: "newest", query: searchTerm, includeCounts: false }),
    enabled: searching,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const recentFailed = postsQuery.isError || postsQuery.data?.ok === false;
  const searchFailed =
    searching && (searchQuery.isError || searchQuery.data?.ok === false);

  const rows = useMemo<Row[]>(() => {
    const q = deferred;
    const cmdRows: Row[] = commands
      .filter((c) => !q || matches(`${c.label} ${c.keywords ?? ""}`, q))
      .map((command) => ({ kind: "command", command }));

    const recent =
      postsQuery.data && postsQuery.data.ok ? postsQuery.data.data.userPosts : [];
    // Ignore hits from a stale term (e.g. the field was just cleared and
    // the debounce hasn't caught up yet).
    const found =
      searching && q.length >= MIN_SEARCH_CHARS && searchQuery.data && searchQuery.data.ok
        ? searchQuery.data.data.userPosts
        : [];
    // Server hits first, then recent posts that match word-by-word; the
    // local filter also trims placeholder results from the previous query.
    const seen = new Set<string>();
    const postRows: Row[] = [...found, ...recent]
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return !q || matches(p.originalContent ?? "", q);
      })
      .slice(0, q ? MAX_POSTS : 3)
      .map((p) => ({
        kind: "post",
        id: p.id,
        label: firstLine(p.originalContent),
        status: p.status,
        run: () => navigate(dash(`posts/${p.id}`)),
      }));

    const actions = cmdRows.filter(
      (r) => r.kind === "command" && r.command.group === "Actions",
    );
    const goTo = cmdRows.filter(
      (r) => r.kind === "command" && r.command.group === "Go to",
    );
    const createWithText: Row[] =
      q && canCompose
        ? [
            {
              kind: "command",
              command: {
                id: "create-with-text",
                group: "Actions",
                label: `Create post: “${q.length > 48 ? `${q.slice(0, 48)}…` : q}”`,
                icon: SquarePen,
                run: () => openComposer({ text: q }),
              },
            },
          ]
        : [];
    // With a query, matching actions first, then the free-text create.
    return [...actions, ...createWithText, ...goTo.slice(0, q ? 8 : 12), ...postRows];
  }, [deferred, commands, postsQuery.data, searching, searchQuery.data, navigate, dash, canCompose]);

  const clampedActive = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${clampedActive}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [clampedActive]);

  const runRow = (row: Row | undefined) => {
    if (!row) return;
    closeCommandPalette();
    if (row.kind === "command") row.command.run();
    else row.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter / arrows that confirm or navigate an IME composition belong to
    // the IME, not the result list (keyCode 229 covers Safari's late flag).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((clampedActive + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((clampedActive - 1 + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runRow(rows[clampedActive]);
    } else if (e.key === "?" && query.trim() === "") {
      // The footer's "? all shortcuts": the global hotkey can't fire while
      // focus is in this input, so an empty search hands off here. Once the
      // user is typing, "?" is just text.
      e.preventDefault();
      openShortcutSheet();
    }
  };

  let lastGroup: string | null = null;
  const activeId = rows.length ? `${listId}-opt-${clampedActive}` : undefined;

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search posts, pages and actions…"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Search posts, pages and actions"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text-subtle"
        />
        <Kbd keys="esc" className="hidden sm:inline-flex" />
      </div>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Results"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
      >
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-text-muted">
            Nothing matches “{deferred}”.
          </p>
        ) : null}
        {rows.map((row, index) => {
          const group = row.kind === "command" ? row.command.group : "Posts";
          const header = group !== lastGroup ? group : null;
          lastGroup = group;
          const selected = index === clampedActive;
          const Icon = row.kind === "command" ? (row.command.icon ?? FileText) : FileText;
          return (
            <div key={row.kind === "command" ? row.command.id : `post-${row.id}`}>
              {header ? (
                <div className="px-3 pb-1 pt-2.5 text-xs font-medium text-text-muted">
                  {header}
                </div>
              ) : null}
              <div
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={selected}
                data-index={index}
                onMouseMove={() => {
                  if (!selected) setActive(index);
                }}
                onClick={() => runRow(row)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  selected ? "bg-bg-muted text-text" : "text-text",
                )}
              >
                <Icon className="size-4 shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate">
                  {row.kind === "command" ? row.command.label : row.label}
                </span>
                {row.kind === "post" ? (
                  <StatusPill status={toPillStatus(row.status)} />
                ) : row.command.keys ? (
                  <Kbd keys={row.command.keys} />
                ) : null}
              </div>
            </div>
          );
        })}
        {recentFailed || searchFailed ? (
          <p className="px-3 py-2 text-xs text-text-muted">
            {searchFailed
              ? "Couldn’t search posts."
              : "Couldn’t load recent posts."}{" "}
            <button
              type="button"
              className="font-medium text-text underline underline-offset-2"
              onClick={() => {
                if (recentFailed) void postsQuery.refetch();
                if (searchFailed) void searchQuery.refetch();
              }}
            >
              Retry
            </button>
          </p>
        ) : null}
      </div>
    </>
  );
}
