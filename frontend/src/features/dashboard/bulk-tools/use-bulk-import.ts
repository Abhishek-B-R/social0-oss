import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { useDashboardBasePath } from "@/components/app";
import { useAccountsForForm } from "@/features/dashboard/create/useAccountsForForm";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { XPostSettings } from "@/components/XPostSettingsInline";
import { useInvalidateQueries } from "@/hooks/use-invalidate-queries";
import { computeBulkSchedule } from "@/lib/bulk-schedule";
import { formatBytes } from "@/lib/media-limits";
import {
  getPinterestBoardRequiredMessage,
} from "@/lib/pinterest-board-validation";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import { captureBulkPostsScheduled } from "@/lib/posthog-events";
import {
  REMEMBERED_ACCOUNT_KEYS,
  useApplyRememberedSelectionWhenReady,
  useRememberedAccounts,
} from "@/lib/remembered-accounts";
import { useRememberedAutoRepostAutoPlug } from "@/lib/remembered-autorepost-autoplug";
import { MAX_VIDEO_DURATION_SECONDS, VIDEO_DURATION_MESSAGE } from "@/lib/video-duration";
import {
  CAPTION_MAX,
  EMPTY_CAPTION_FALLBACK,
  IMAGE_PLATFORMS,
  LIMITS,
  VIDEO_PLATFORMS,
  YOUTUBE_TITLE_MAX,
  accountsForRow,
  defaultPattern,
  effectiveGap,
  getRowIssues,
  hasErrors,
  kindOfFile,
  type BulkImportScope,
  type BulkKind,
  type BulkRow,
  type ImportMode,
  type RowIssue,
  type SchedulePattern,
} from "./bulk-import-model";
import {
  guessMapping,
  matchCsvToFiles,
  parseCsv,
  CSV_MAX_BYTES,
  type CsvMapping,
  type CsvTable,
} from "./bulk-import-csv";
import { fetchNextQueueSlot, runBulkImport, type ImportJob, type ImportPhase } from "./bulk-import-run";
import { probeVideo } from "./media-probe";

export type WizardStep = 1 | 2 | 3;

export type ImportProgress = {
  phase: ImportPhase;
  total: number;
  uploadPercent: number;
  creatingIndex: number;
};

export type ImportResult = {
  done: number;
  failed: number;
  cancelled: boolean;
  mode: ImportMode;
};

export type GlobalIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  action?: { label: string; step?: WizardStep; href?: string; retry?: () => void };
};

export type CsvState = {
  fileName: string;
  table: CsvTable;
  mapping: CsvMapping;
};

/** Minute-precision key for a scheduled time (the picker has no seconds). */
function slotKey(d: Date): number {
  return Math.floor(d.getTime() / 60_000);
}

/**
 * Give rows pattern times in order. Slots in `taken` (times already held by
 * posts imported earlier in this session) are skipped, so another round of
 * files never lands on top of posts that are already scheduled.
 */
function applyPattern(
  rows: BulkRow[],
  p: SchedulePattern,
  taken: ReadonlySet<number>,
): BulkRow[] {
  const [h, m] = p.startTime.split(":").map(Number);
  const start = new Date(`${p.startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return rows;
  // At most `taken.size` slots are skipped, so this always yields enough.
  const dates = computeBulkSchedule(
    rows.length + taken.size,
    start,
    h ?? 0,
    m ?? 0,
    p.perDay,
    effectiveGap(p),
  )
    .filter((d) => !taken.has(slotKey(d)))
    .slice(0, rows.length);
  return rows.map((r, i) =>
    r.status === "imported" ? r : { ...r, scheduledAt: dates[i] ?? r.scheduledAt },
  );
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "your time zone";
  } catch {
    return "your time zone";
  }
}

/**
 * All state for the bulk import wizard (upload → map → review → import).
 * Steps render from this object; nothing here touches the DOM.
 */
export function useBulkImport(scope: BulkImportScope) {
  const posthog = usePostHog();
  const invalidateQueries = useInvalidateQueries();
  const base = useDashboardBasePath();

  const supportedPlatforms = useMemo(
    () => [...(scope === "image" ? IMAGE_PLATFORMS : VIDEO_PLATFORMS)],
    [scope],
  );
  const acceptKinds = useMemo<BulkKind[]>(
    () => (scope === "mixed" ? ["image", "video"] : [scope]),
    [scope],
  );

  // ---- Accounts (with "Remember") -----------------------------------------
  const { accounts, loading: accountsLoading } = useAccountsForForm(supportedPlatforms);
  const selectableAccounts = useMemo(
    () => accounts.filter((a) => !a.tokenExpired),
    [accounts],
  );
  const {
    remember,
    setRememberAndSelection,
    getInitialSelectedIds,
    persistSelection,
  } = useRememberedAccounts(
    scope === "image" ? REMEMBERED_ACCOUNT_KEYS.bulkImage : REMEMBERED_ACCOUNT_KEYS.bulkVideo,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const { isHydrated } = useApplyRememberedSelectionWhenReady({
    skip: false,
    accountsLoading,
    accounts,
    getInitialSelectedIds,
    setSelectedIds,
  });
  useEffect(() => {
    if (!isHydrated) return;
    if (remember) persistSelection(selectedIds);
  }, [isHydrated, remember, selectedIds, persistSelection]);

  const setRemember = useCallback(
    (checked: boolean) => setRememberAndSelection(checked, selectedIds),
    [setRememberAndSelection, selectedIds],
  );
  const toggleAccount = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAllAccounts = useCallback(() => {
    setSelectedIds((prev) =>
      selectableAccounts.length > 0 && selectableAccounts.every((a) => prev.has(a.id))
        ? new Set()
        : new Set(selectableAccounts.map((a) => a.id)),
    );
  }, [selectableAccounts]);

  const selectedAccounts = useMemo(
    () => selectableAccounts.filter((a) => selectedIds.has(a.id)),
    [selectableAccounts, selectedIds],
  );
  const selectedPlatforms = useMemo(
    () => new Set(selectedAccounts.map((a) => a.platform)),
    [selectedAccounts],
  );
  const hasX = selectedPlatforms.has("twitter_x");
  const hasYouTube = selectedPlatforms.has("youtube");
  const pinterestAccounts = useMemo(
    () => selectedAccounts.filter((a) => a.platform === "pinterest"),
    [selectedAccounts],
  );

  // ---- Rows ----------------------------------------------------------------
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [probing, setProbing] = useState(0);
  const [pattern, setPatternState] = useState<SchedulePattern>(() => defaultPattern());
  const patternRef = useRef(pattern);
  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);

  // Times held by posts this session already scheduled. Imported rows leave
  // the list, so without this the pattern would hand their slots out again
  // ("Import more", or files added after a partial import).
  const takenSlotsRef = useRef<Set<number>>(new Set());

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  // Free object URLs when the page goes away.
  useEffect(
    () => () => {
      for (const r of rowsRef.current) URL.revokeObjectURL(r.previewUrl);
    },
    [],
  );

  // Files accepted but still being read (videos), so two quick drops don't
  // both squeeze past the per-import caps.
  const inflightRef = useRef<{ key: string; kind: BulkKind; size: number }[]>([]);

  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;
      toast.dismiss();
      const current = [
        ...rowsRef.current.map((r) => ({
          key: `${r.file.name}|${r.file.size}`,
          kind: r.kind,
          size: r.file.size,
        })),
        ...inflightRef.current,
      ];
      const notes: string[] = [];
      const seen = new Set(current.map((r) => r.key));
      const count: Record<BulkKind, number> = { image: 0, video: 0 };
      const bytes: Record<BulkKind, number> = { image: 0, video: 0 };
      for (const r of current) {
        count[r.kind] += 1;
        bytes[r.kind] += r.size;
      }
      const accepted: { file: File; kind: BulkKind }[] = [];
      let unsupported = 0;
      let duplicates = 0;
      const tooBig: string[] = [];
      let overCount = 0;
      let overTotal = 0;
      for (const file of incoming) {
        const kind = kindOfFile(file);
        const lim = kind ? LIMITS[kind] : null;
        if (!kind || !lim || !acceptKinds.includes(kind) || !(lim.accept as readonly string[]).includes(file.type)) {
          unsupported += 1;
          continue;
        }
        const key = `${file.name}|${file.size}`;
        if (seen.has(key)) {
          duplicates += 1;
          continue;
        }
        if (file.size > lim.maxFileBytes) {
          tooBig.push(file.name);
          continue;
        }
        if (count[kind] + 1 > lim.maxCount) {
          overCount += 1;
          continue;
        }
        if (bytes[kind] + file.size > lim.maxTotalBytes) {
          overTotal += 1;
          continue;
        }
        seen.add(key);
        count[kind] += 1;
        bytes[kind] += file.size;
        accepted.push({ file, kind });
      }
      if (unsupported > 0) {
        const allowed = acceptKinds.map((k) => LIMITS[k].label).join("; ");
        notes.push(`${unsupported} file${unsupported === 1 ? " isn't" : "s aren't"} supported here (${allowed}).`);
      }
      if (duplicates > 0) notes.push(`Skipped ${duplicates} file${duplicates === 1 ? "" : "s"} already added.`);
      if (tooBig.length > 0) {
        notes.push(
          `${tooBig.length} file${tooBig.length === 1 ? " is" : "s are"} over the size limit (images 50MB, videos ${formatBytes(LIMITS.video.maxFileBytes)}).`,
        );
      }
      if (overCount > 0) {
        notes.push(
          `${overCount} file${overCount === 1 ? "" : "s"} didn't fit: up to ${LIMITS.image.maxCount} images and ${LIMITS.video.maxCount} videos per import.`,
        );
      }
      if (overTotal > 0) {
        notes.push(
          `${overTotal} file${overTotal === 1 ? "" : "s"} would go over the total size (images ${formatBytes(LIMITS.image.maxTotalBytes)}, videos ${formatBytes(LIMITS.video.maxTotalBytes)}). Split them into another import.`,
        );
      }

      const inflight = accepted.map((a) => ({
        key: `${a.file.name}|${a.file.size}`,
        kind: a.kind,
        size: a.file.size,
      }));
      inflightRef.current = [...inflightRef.current, ...inflight];
      const videos = accepted.filter((a) => a.kind === "video");
      if (videos.length > 0) setProbing((n) => n + videos.length);
      const probed = await Promise.all(
        accepted.map(async ({ file, kind }) => {
          if (kind !== "video") {
            return { file, kind, durationSec: 0, width: 0, height: 0, posterUrl: "" };
          }
          const p = await probeVideo(file);
          return { file, kind, ...p };
        }),
      );
      if (videos.length > 0) setProbing((n) => Math.max(0, n - videos.length));
      inflightRef.current = inflightRef.current.filter((x) => !inflight.includes(x));

      const tooLong = probed.filter(
        (p) => p.kind === "video" && p.durationSec > MAX_VIDEO_DURATION_SECONDS,
      );
      if (tooLong.length > 0) notes.push(VIDEO_DURATION_MESSAGE);
      const keep = probed.filter((p) => !tooLong.includes(p));

      for (const n of notes) toast.error(n);
      if (keep.length === 0) return;

      const newRows: BulkRow[] = keep.map((p) => ({
        id: crypto.randomUUID(),
        file: p.file,
        kind: p.kind,
        previewUrl: URL.createObjectURL(p.file),
        posterUrl: p.posterUrl,
        caption: "",
        youtubeTitle: "",
        scheduledAt: new Date(),
        durationSec: p.durationSec,
        width: p.width,
        height: p.height,
        skippedPlatforms: [],
        status: "ready",
      }));
      // New files continue the pattern after the existing ones; existing
      // times (edited by hand or from a spreadsheet) stay as they are.
      setRows((prev) => {
        const dated = applyPattern([...prev, ...newRows], patternRef.current, takenSlotsRef.current);
        return [...prev, ...dated.slice(prev.length)];
      });
    },
    [acceptKinds],
  );

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const clearRows = useCallback(() => {
    setRows((prev) => {
      for (const r of prev) URL.revokeObjectURL(r.previewUrl);
      return [];
    });
  }, []);

  const updateRow = useCallback((id: string, patch: Partial<BulkRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const toggleSkip = useCallback((id: string, platform: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id !== id
          ? r
          : {
              ...r,
              skippedPlatforms: r.skippedPlatforms.includes(platform)
                ? r.skippedPlatforms.filter((p) => p !== platform)
                : [...r.skippedPlatforms, platform],
            },
      ),
    );
  }, []);

  const setPattern = useCallback((next: SchedulePattern) => {
    setPatternState(next);
    patternRef.current = next;
    setRows((prev) => applyPattern(prev, next, takenSlotsRef.current));
  }, []);

  const reapplyPattern = useCallback(() => {
    setRows((prev) => applyPattern(prev, patternRef.current, takenSlotsRef.current));
  }, []);

  // ---- Captions ------------------------------------------------------------
  const [bulkCaption, setBulkCaption] = useState("");
  const [bulkYoutubeTitle, setBulkYoutubeTitle] = useState("");

  const applyCaptionToAll = useCallback(() => {
    const caption = bulkCaption.slice(0, CAPTION_MAX);
    setRows((prev) => prev.map((r) => (r.status === "imported" ? r : { ...r, caption })));
    toast.success(`Caption added to ${rowsRef.current.length} file${rowsRef.current.length === 1 ? "" : "s"}`);
  }, [bulkCaption]);

  const applyYoutubeTitleToAll = useCallback(() => {
    const youtubeTitle = bulkYoutubeTitle.slice(0, YOUTUBE_TITLE_MAX);
    setRows((prev) =>
      prev.map((r) => (r.kind === "video" && r.status !== "imported" ? { ...r, youtubeTitle } : r)),
    );
    const n = rowsRef.current.filter((r) => r.kind === "video").length;
    toast.success(`YouTube title added to ${n} video${n === 1 ? "" : "s"}`);
  }, [bulkYoutubeTitle]);

  // ---- CSV -----------------------------------------------------------------
  const [csv, setCsv] = useState<CsvState | null>(null);

  const loadCsv = useCallback(async (file: File) => {
    if (file.size > CSV_MAX_BYTES) {
      toast.error("That spreadsheet is over 2MB. Export just the columns you need.");
      return;
    }
    try {
      const table = parseCsv(await file.text());
      if (table.headers.length === 0 || table.rows.length === 0) {
        toast.error("That file has no rows. The first row should be column names.");
        return;
      }
      setCsv({ fileName: file.name, table, mapping: guessMapping(table.headers) });
    } catch {
      toast.error("Couldn't read that file. Save it as CSV (comma separated) and try again.");
    }
  }, []);

  const setCsvMapping = useCallback((mapping: CsvMapping) => {
    setCsv((prev) => (prev ? { ...prev, mapping } : prev));
  }, []);

  const csvPreview = useMemo(() => {
    if (!csv) return null;
    const [h, m] = pattern.startTime.split(":").map(Number);
    return matchCsvToFiles(
      csv.table,
      csv.mapping,
      rows.filter((r) => r.status !== "imported").map((r) => ({ id: r.id, name: r.file.name })),
      { hours: h ?? 9, minutes: m ?? 0 },
    );
  }, [csv, rows, pattern.startTime]);

  const applyCsv = useCallback(() => {
    if (!csvPreview || csvPreview.matched === 0) return;
    const map = csvPreview.byFileId;
    setRows((prev) =>
      prev.map((r) => {
        const v = map.get(r.id);
        if (!v) return r;
        return {
          ...r,
          ...(v.caption !== undefined && v.caption !== ""
            ? { caption: v.caption.slice(0, CAPTION_MAX) }
            : {}),
          ...(v.youtubeTitle !== undefined && v.youtubeTitle !== "" && r.kind === "video"
            ? { youtubeTitle: v.youtubeTitle.slice(0, YOUTUBE_TITLE_MAX) }
            : {}),
          ...(v.scheduledAt ? { scheduledAt: v.scheduledAt } : {}),
        };
      }),
    );
    toast.success(
      `Matched ${csvPreview.matched} file${csvPreview.matched === 1 ? "" : "s"} from ${csv?.fileName ?? "your spreadsheet"}`,
    );
  }, [csvPreview, csv?.fileName]);

  // ---- Mode & queue --------------------------------------------------------
  const [mode, setMode] = useState<ImportMode>("schedule");
  const nextSlotQuery = useQuery({
    queryKey: ["queue-next-slot", base],
    queryFn: ({ signal }) => fetchNextQueueSlot(signal),
    enabled: mode === "queue",
    staleTime: 30_000,
  });

  // ---- Network settings ----------------------------------------------------
  const [pinterestSettings, setPinterestSettings] = useState<Record<string, PinterestPostSettings>>({});
  // Start each Pinterest account on its saved default board (Accounts drawer,
  // `platformMetadata.pinterestDefaultBoardId`), like the composer does. Once
  // per account, so a board the user picks afterwards is never overwritten.
  const [seededPinterestIds, setSeededPinterestIds] = useState<ReadonlySet<string>>(() => new Set());
  const unseededPinterest = pinterestAccounts.filter((a) => !seededPinterestIds.has(a.id));
  if (unseededPinterest.length > 0) {
    setSeededPinterestIds((prev) => new Set([...prev, ...unseededPinterest.map((a) => a.id)]));
    setPinterestSettings((prev) => {
      let next = prev;
      for (const acc of unseededPinterest) {
        const id = acc.platformMetadata?.pinterestDefaultBoardId;
        const boardId = typeof id === "string" ? id.trim() : "";
        if (!boardId || prev[acc.id]?.boardId) continue;
        next = {
          ...next,
          [acc.id]: {
            boardId,
            title: prev[acc.id]?.title ?? "",
            link: prev[acc.id]?.link ?? "",
            rememberBoard: prev[acc.id]?.rememberBoard ?? false,
            rememberLink: prev[acc.id]?.rememberLink ?? false,
          },
        };
      }
      return next;
    });
  }
  const [pinterestTabRaw, setPinterestTab] = useState(0);
  // Deselecting Pinterest accounts on Upload can leave the stored index past
  // the end; clamp so the Match step always shows a real account's board form.
  const pinterestTab = Math.min(pinterestTabRaw, Math.max(0, pinterestAccounts.length - 1));
  const [xSettings, setXSettings] = useState<XPostSettings>({
    madeWithAi: false,
    paidPartnership: false,
  });
  const {
    remember: rememberAutoFeatures,
    setRemember: setRememberAutoFeatures,
    persistAutoRepost,
    persistAutoPlug,
    getInitialState: getAutoFeaturesInitialState,
  } = useRememberedAutoRepostAutoPlug();
  const [autoRepost, setAutoRepost] = useState<AutoResurfaceConfig | null>(null);
  const [autoPlug, setAutoPlug] = useState<AutoPlugConfig | null>(null);
  const [restoredAuto, setRestoredAuto] = useState(false);
  // Restore remembered Auto-Repost / Auto-Plug the first time X is picked.
  if (hasX && rememberAutoFeatures && !restoredAuto) {
    const initial = getAutoFeaturesInitialState();
    if (initial.autoRepostConfig) setAutoRepost(initial.autoRepostConfig);
    if (initial.autoPlugConfig) setAutoPlug(initial.autoPlugConfig);
    setRestoredAuto(true);
  }
  useEffect(() => {
    if (!rememberAutoFeatures || !hasX) return;
    persistAutoRepost(!!autoRepost, autoRepost);
    persistAutoPlug(!!autoPlug, autoPlug);
  }, [rememberAutoFeatures, hasX, autoRepost, autoPlug, persistAutoRepost, persistAutoPlug]);

  // ---- Validation ----------------------------------------------------------
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const pendingRows = useMemo(() => rows.filter((r) => r.status !== "imported"), [rows]);

  const issuesByRow = useMemo(() => {
    const ctx = { selectedAccounts, mode, now };
    const map = new Map<string, RowIssue[]>();
    for (const r of pendingRows) map.set(r.id, getRowIssues(r, ctx));
    return map;
  }, [pendingRows, selectedAccounts, mode, now]);

  const readyRows = useMemo(
    () => pendingRows.filter((r) => !hasErrors(issuesByRow.get(r.id) ?? [])),
    [pendingRows, issuesByRow],
  );

  const rowsTargetPinterest = useMemo(
    () =>
      pendingRows.some((r) =>
        accountsForRow(r, selectedAccounts).some((a) => a.platform === "pinterest"),
      ),
    [pendingRows, selectedAccounts],
  );

  const globalIssues = useMemo<GlobalIssue[]>(() => {
    const list: GlobalIssue[] = [];
    if (selectedAccounts.length === 0) {
      list.push({
        code: "no-accounts",
        severity: "error",
        message: "Pick at least one account to post to.",
        action: { label: "Pick accounts", step: 1 },
      });
    }
    if (rowsTargetPinterest) {
      const msg = getPinterestBoardRequiredMessage(pinterestAccounts, pinterestSettings, "schedule");
      if (msg) {
        list.push({
          code: "pinterest-board",
          severity: "error",
          message:
            pinterestAccounts.length > 1
              ? "Choose a Pinterest board for each Pinterest account."
              : "Choose a Pinterest board.",
          action: { label: "Choose board", step: 2 },
        });
      }
    }
    if (mode === "queue") {
      const res = nextSlotQuery.data;
      if (nextSlotQuery.isError || (res && !res.ok)) {
        list.push({
          code: "queue-error",
          severity: "error",
          message: res && !res.ok ? res.error : "Couldn't read your posting schedule.",
          action: { label: "Retry", retry: () => void nextSlotQuery.refetch() },
        });
      } else if (res?.ok && !res.slot) {
        list.push({
          code: "queue-empty",
          severity: "error",
          message: "Your posting schedule has no open times. Add posting times, or pick Schedule instead.",
          action: { label: "Set posting times", href: "settings/schedule" },
        });
      }
    }
    return list;
  }, [selectedAccounts.length, rowsTargetPinterest, pinterestAccounts, pinterestSettings, mode, nextSlotQuery]);

  const blockingGlobal = globalIssues.some((g) => g.severity === "error");

  // ---- Import --------------------------------------------------------------
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importedTotal, setImportedTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const buildMetadata = useCallback(
    (row: BulkRow): Record<string, unknown> => {
      const targets = accountsForRow(row, selectedAccounts);
      const platforms = new Set(targets.map((a) => a.platform));
      const md: Record<string, unknown> = { contentType: row.kind };
      if (platforms.has("twitter_x")) {
        if (autoRepost || autoPlug) {
          md.bulkAutoFeatures = {
            autoRepostConfig: autoRepost,
            autoPlugConfig: autoPlug,
          };
        }
        md.x = {
          madeWithAi: xSettings.madeWithAi,
          paidPartnership: xSettings.paidPartnership,
        };
      }
      if (platforms.has("pinterest")) {
        const pin: Record<string, { boardId: string; title?: string; link?: string }> = {};
        for (const a of targets) {
          if (a.platform !== "pinterest") continue;
          const s = pinterestSettings[a.id];
          if (!s?.boardId?.trim()) continue;
          pin[a.id] = {
            boardId: s.boardId.trim(),
            ...(s.title?.trim() ? { title: s.title.trim().slice(0, 100) } : {}),
            ...(s.link?.trim() ? { link: s.link.trim() } : {}),
          };
        }
        md.pinterest = pin;
      }
      if (platforms.has("youtube") && row.kind === "video") {
        md.youtube = { title: row.youtubeTitle.trim().slice(0, YOUTUBE_TITLE_MAX) };
      }
      return md;
    },
    [selectedAccounts, autoRepost, autoPlug, xSettings, pinterestSettings],
  );

  const startImport = useCallback(async () => {
    if (progress || readyRows.length === 0 || blockingGlobal) return;
    const jobs: ImportJob[] = readyRows.map((r) => ({
      rowId: r.id,
      file: r.file,
      mediaId: r.mediaId,
      caption: r.caption.trim() || EMPTY_CAPTION_FALLBACK,
      accountIds: accountsForRow(r, selectedAccounts).map((a) => a.id),
      scheduledAt: mode === "schedule" ? r.scheduledAt : null,
      metadata: buildMetadata(r),
    }));
    const jobIds = new Set(jobs.map((j) => j.rowId));
    const kindById = new Map(readyRows.map((r) => [r.id, r.kind]));
    const runMode = mode;
    const controller = new AbortController();
    abortRef.current = controller;
    toast.dismiss();
    setResult(null);
    setProgress({ phase: "uploading", total: jobs.length, uploadPercent: 0, creatingIndex: 0 });
    setRows((prev) =>
      prev.map((r) =>
        jobIds.has(r.id) ? { ...r, status: "importing", importError: undefined } : r,
      ),
    );

    const doneIds = new Set<string>();
    const summary = await runBulkImport(jobs, runMode, controller.signal, {
      onPhase: (phase, total) =>
        setProgress((p) => (p ? { ...p, phase, total, creatingIndex: 0 } : p)),
      onUploadProgress: (uploadPercent) =>
        setProgress((p) => (p ? { ...p, uploadPercent } : p)),
      onUploaded: (rowId, mediaId) => updateRow(rowId, { mediaId }),
      onCreating: (creatingIndex) =>
        setProgress((p) => (p ? { ...p, creatingIndex } : p)),
      onRowDone: (rowId, postId) => {
        doneIds.add(rowId);
        updateRow(rowId, { status: "imported", postId });
      },
      onRowFailed: (rowId, error) => updateRow(rowId, { status: "failed", importError: error }),
    });

    abortRef.current = null;
    for (const j of jobs) {
      if (j.scheduledAt && doneIds.has(j.rowId)) takenSlotsRef.current.add(slotKey(j.scheduledAt));
    }
    // Imported rows leave the list; cancelled ones go back to ready.
    setRows((prev) => {
      const next: BulkRow[] = [];
      for (const r of prev) {
        if (doneIds.has(r.id)) {
          URL.revokeObjectURL(r.previewUrl);
          continue;
        }
        next.push(r.status === "importing" ? { ...r, status: "ready" } : r);
      }
      return next;
    });
    setProgress(null);
    setResult({ ...summary, mode: runMode });
    setImportedTotal((n) => n + summary.done);

    if (summary.done > 0) {
      invalidateQueries();
      if (runMode !== "draft") {
        const byKind: Record<BulkKind, number> = { image: 0, video: 0 };
        for (const id of doneIds) {
          const k = kindById.get(id);
          if (k) byKind[k] += 1;
        }
        for (const k of ["image", "video"] as const) {
          if (byKind[k] > 0) {
            captureBulkPostsScheduled(posthog, k, byKind[k], selectedAccounts.length);
          }
        }
      }
    }
    if (summary.cancelled) {
      toast.message(
        summary.done > 0
          ? `Stopped. ${summary.done} post${summary.done === 1 ? " was" : "s were"} already created.`
          : "Import cancelled. Nothing was created.",
      );
    } else if (summary.failed > 0) {
      toast.error(
        `${summary.failed} file${summary.failed === 1 ? "" : "s"} couldn't be imported. See the rows marked in red.`,
      );
    }
  }, [
    progress,
    readyRows,
    blockingGlobal,
    selectedAccounts,
    mode,
    buildMetadata,
    updateRow,
    invalidateQueries,
    posthog,
  ]);

  const cancelImport = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Warn before leaving with files that aren't imported yet.
  const hasUnsaved = progress !== null || pendingRows.length > 0;
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  const startOver = useCallback(() => {
    clearRows();
    setCsv(null);
    setResult(null);
    setImportedTotal(0);
    setBulkCaption("");
    setBulkYoutubeTitle("");
  }, [clearRows]);

  return {
    scope,
    acceptKinds,
    supportedPlatforms,
    timeZone: deviceTimeZone(),
    // accounts
    accounts,
    accountsLoading,
    selectableAccounts,
    selectedIds,
    selectedAccounts,
    selectedPlatforms,
    toggleAccount,
    toggleAllAccounts,
    remember,
    setRemember,
    hasX,
    hasYouTube,
    pinterestAccounts,
    // rows
    rows,
    pendingRows,
    probing,
    addFiles,
    removeRow,
    clearRows,
    updateRow,
    toggleSkip,
    // schedule
    pattern,
    setPattern,
    reapplyPattern,
    mode,
    setMode,
    nextSlot: nextSlotQuery,
    // captions
    bulkCaption,
    setBulkCaption,
    applyCaptionToAll,
    bulkYoutubeTitle,
    setBulkYoutubeTitle,
    applyYoutubeTitleToAll,
    // csv
    csv,
    loadCsv,
    setCsvMapping,
    clearCsv: () => setCsv(null),
    csvPreview,
    applyCsv,
    // network settings
    pinterestSettings,
    setPinterestSettings,
    pinterestTab,
    setPinterestTab,
    xSettings,
    setXSettings,
    autoRepost,
    autoPlug,
    setAutoFeatures: (next: { autoRepost: AutoResurfaceConfig | null; autoPlug: AutoPlugConfig | null }) => {
      setAutoRepost(next.autoRepost);
      setAutoPlug(next.autoPlug);
    },
    rememberAutoFeatures,
    setRememberAutoFeatures,
    // validation
    issuesByRow,
    readyRows,
    globalIssues,
    blockingGlobal,
    // import
    progress,
    result,
    importedTotal,
    startImport,
    cancelImport,
    startOver,
  };
}

export type BulkImportState = ReturnType<typeof useBulkImport>;
