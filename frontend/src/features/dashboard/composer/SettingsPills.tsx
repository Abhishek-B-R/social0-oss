import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ImagePlus,
  Lock,
  Megaphone,
  Repeat2,
  X as XIcon,
} from "lucide-react";
import Link from "@/components/AppLink";
import { NetworkIcon, Toggle } from "@/components/app";
import { TikTokSettings } from "@/components/TikTokSettings";
import {
  DEFAULT_TIKTOK_POST_SETTINGS,
  type TikTokPostSettings,
} from "@/components/tiktok-post-settings";
import { PinterestAccountSettings } from "@/components/PinterestAccountSettings";
import { XPostSettingsInline } from "@/components/XPostSettingsInline";
import { AccountTabs } from "@/components/AccountTabs";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import type { PinterestPostSettings } from "@/lib/pinterest-settings";
import { fetchApi } from "@/lib/fetch-api";
import { uploadFile } from "@/lib/upload-file";
import { cn } from "@/lib/utils";
import { Popover } from "./Popover";
import type {
  ComposerAccount,
  ComposerContentType,
  ComposerDraft,
  SettingKey,
} from "./types";

const PRIVACY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Public",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

type Props = {
  draft: ComposerDraft;
  update: (patch: Partial<ComposerDraft> | ((d: ComposerDraft) => Partial<ComposerDraft>)) => void;
  selected: ComposerAccount[];
  type: ComposerContentType;
  allowAutoPlug: boolean;
  allowAutoRepost: boolean;
  use24h: boolean;
  billingHref: string;
  open: SettingKey | null;
  onOpenChange: (key: SettingKey | null) => void;
  /** Settings with a blocking issue get a warning style. */
  needsAttention: ReadonlySet<SettingKey>;
  rememberAutomations: boolean;
  onRememberAutomationsChange: (on: boolean) => void;
  onTikTokMaxDuration: (accountId: string, seconds: number) => void;
  videoDurationSec: number | null;
};

/**
 * Network settings as small pills (TikTok, X labels, Pinterest board,
 * YouTube title, Instagram reel) plus X automations. Each opens a popover;
 * auto-plug / auto-repost keep their existing settings dialogs.
 */
export function SettingsPills(props: Props) {
  const { draft, update, selected, type, open, onOpenChange } = props;
  const of = (p: string) => selected.filter((a) => a.platform === p);
  const tiktok = of("tiktok");
  const pins = of("pinterest");
  const xs = of("twitter_x");
  const showYouTube = type === "video" && of("youtube").length > 0;
  const showInstagram = type === "video" && of("instagram").length > 0;

  const tiktokRef = useRef<HTMLButtonElement>(null);
  const xRef = useRef<HTMLButtonElement>(null);
  const pinterestRef = useRef<HTMLButtonElement>(null);
  const youtubeRef = useRef<HTMLButtonElement>(null);
  const instagramRef = useRef<HTMLButtonElement>(null);
  const close = () => onOpenChange(null);
  const toggle = (k: SettingKey) => onOpenChange(open === k ? null : k);

  // Restore-on-cancel for the automation dialogs.
  const before = useRef<{ plug: ComposerDraft["autoPlug"]; repost: ComposerDraft["autoRepost"] }>({
    plug: null,
    repost: null,
  });

  if (
    tiktok.length === 0 &&
    pins.length === 0 &&
    xs.length === 0 &&
    !showYouTube &&
    !showInstagram
  ) {
    return null;
  }

  const tiktokLabel = (() => {
    if (tiktok.length > 1) return `TikTok settings (${tiktok.length})`;
    const s = draft.tiktok[tiktok[0]?.id ?? ""] ?? DEFAULT_TIKTOK_POST_SETTINGS;
    const bits = [PRIVACY[s.privacy_level] ?? "Public"];
    if (type !== "image") bits.push(s.disable_duet ? "Duet off" : "Duet on");
    if (s.post_as_draft) bits.push("as draft");
    return `TikTok: ${bits.join(" · ")}`;
  })();

  const xLabel = (() => {
    const bits = [
      draft.x.madeWithAi ? "Made with AI" : null,
      draft.x.paidPartnership ? "Paid partnership" : null,
    ].filter(Boolean);
    return bits.length ? `X: ${bits.join(" · ")}` : "X labels";
  })();

  const plug = draft.autoPlug;
  const repost = draft.autoRepost;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Network settings">
      {tiktok.length > 0 ? (
        <Pill
          refEl={tiktokRef}
          icon={<NetworkIcon network="tiktok" size={12} label="" />}
          label={tiktokLabel}
          active={open === "tiktok"}
          warn={props.needsAttention.has("tiktok")}
          onClick={() => toggle("tiktok")}
        />
      ) : null}
      {pins.length > 0 ? (
        <PinterestPill
          refEl={pinterestRef}
          accounts={pins}
          settings={draft.pinterest}
          active={open === "pinterest"}
          warn={props.needsAttention.has("pinterest")}
          onClick={() => toggle("pinterest")}
        />
      ) : null}
      {showYouTube ? (
        <Pill
          refEl={youtubeRef}
          icon={<NetworkIcon network="youtube" size={12} label="" />}
          label={
            draft.youtubeTitle.trim()
              ? `YouTube title: ${truncate(draft.youtubeTitle.trim(), 28)}`
              : "YouTube title"
          }
          active={open === "youtube"}
          onClick={() => toggle("youtube")}
        />
      ) : null}
      {showInstagram ? (
        <Pill
          refEl={instagramRef}
          icon={<NetworkIcon network="instagram" size={12} label="" />}
          label={
            [
              draft.instagram.coverImageUrl ? "Cover set" : null,
              draft.instagram.isTrialReel ? "Trial reel" : null,
            ].filter(Boolean).join(" · ") || "Instagram reel"
          }
          active={open === "instagram"}
          onClick={() => toggle("instagram")}
        />
      ) : null}
      {xs.length > 0 ? (
        <>
          <Pill
            refEl={xRef}
            icon={<NetworkIcon network="twitter_x" size={12} label="" />}
            label={xLabel}
            active={open === "x"}
            onClick={() => toggle("x")}
          />
          <AutomationPill
            icon={<Megaphone className="size-3" aria-hidden />}
            label={
              plug
                ? `Auto-plug after ${plug.threshold} ${plug.metricType === "retweets" ? "reposts" : "likes"}`
                : "Auto-plug"
            }
            on={!!plug}
            allowed={props.allowAutoPlug}
            billingHref={props.billingHref}
            onOpen={() => {
              before.current.plug = draft.autoPlug;
              onOpenChange("autoplug");
            }}
            onClear={() => update({ autoPlug: null })}
            hint="Reply to your X post with a plug once it takes off (X only)"
          />
          <AutomationPill
            icon={<Repeat2 className="size-3" aria-hidden />}
            label={
              repost
                ? `Auto-repost every ${repost.intervalHours}h ×${repost.maxResurfaces}`
                : "Auto-repost"
            }
            on={!!repost}
            allowed={props.allowAutoRepost}
            billingHref={props.billingHref}
            onOpen={() => {
              before.current.repost = draft.autoRepost;
              onOpenChange("autorepost");
            }}
            onClear={() => update({ autoRepost: null })}
            hint="Repost to X on a schedule so more people see it (X only)"
          />
          {props.allowAutoPlug || props.allowAutoRepost ? (
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 px-1.5 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={props.rememberAutomations}
                onChange={(e) => props.onRememberAutomationsChange(e.target.checked)}
                className="size-3.5 rounded border-input accent-[var(--accent)]"
              />
              Remember automations
            </label>
          ) : null}
        </>
      ) : null}

      {/* ---- popovers ---- */}
      <Popover open={open === "tiktok" && tiktok.length > 0} onClose={close} anchorRef={tiktokRef} title="TikTok settings" width={400}>
        <TikTokPanel
          accounts={tiktok}
          settings={draft.tiktok}
          onChange={(id, s) => update((d) => ({ tiktok: { ...d.tiktok, [id]: s } }))}
          mediaType={type === "image" || (type === "collection" && draft.parts[0]?.media.every((m) => m.kind === "image")) ? "photo" : "video"}
          videoDurationSec={props.videoDurationSec}
          onMaxDuration={props.onTikTokMaxDuration}
          autoAddMusic={type === "image" ? draft.tiktokAutoAddMusic : null}
          onAutoAddMusic={(on) => update({ tiktokAutoAddMusic: on })}
        />
      </Popover>
      <Popover open={open === "pinterest" && pins.length > 0} onClose={close} anchorRef={pinterestRef} title="Pinterest" width={400}>
        <PinterestPanel
          accounts={pins}
          settings={draft.pinterest}
          setSettings={(next) =>
            update((d) => ({ pinterest: typeof next === "function" ? next(d.pinterest) : next }))
          }
        />
      </Popover>
      <Popover open={open === "x" && xs.length > 0} onClose={close} anchorRef={xRef} title="X labels" width={340}>
        <XPostSettingsInline value={draft.x} onChange={(x) => update({ x })} isVisible />
      </Popover>
      <Popover open={open === "youtube" && showYouTube} onClose={close} anchorRef={youtubeRef} title="YouTube title" width={360}>
        <YouTubePanel value={draft.youtubeTitle} onChange={(youtubeTitle) => update({ youtubeTitle })} />
      </Popover>
      <Popover open={open === "instagram" && showInstagram} onClose={close} anchorRef={instagramRef} title="Instagram reel" width={380}>
        <InstagramPanel
          value={draft.instagram}
          onChange={(instagram) => update({ instagram })}
        />
      </Popover>

      {open === "autoplug" && xs.length > 0 ? (
        <AutoPlugSettingsModal
          isOpen
          selectedAccountIds={selected.map((a) => a.id)}
          allAccounts={selected}
          initialConfig={draft.autoPlug}
          onChange={(autoPlug) => update({ autoPlug })}
          onDone={close}
          onCancel={() => {
            update({ autoPlug: before.current.plug });
            close();
          }}
        />
      ) : null}
      {open === "autorepost" && xs.length > 0 ? (
        <AutoResurfaceSettingsModal
          isOpen
          selectedAccountIds={selected.map((a) => a.id)}
          allAccounts={selected}
          initialConfig={draft.autoRepost}
          onChange={(autoRepost) => update({ autoRepost })}
          onDone={close}
          onCancel={() => {
            update({ autoRepost: before.current.repost });
            close();
          }}
          use24HourTimeFormat={props.use24h}
        />
      ) : null}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function Pill({
  refEl,
  icon,
  label,
  active,
  warn,
  onClick,
}: {
  refEl: RefObject<HTMLButtonElement | null>;
  icon: ReactNode;
  label: string;
  active: boolean;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={refEl}
      type="button"
      onClick={onClick}
      aria-expanded={active}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 touch:h-10",
        warn
          ? "bg-warning-soft text-warning"
          : active
            ? "bg-bg-muted text-text"
            : "text-text-muted hover:bg-bg-muted hover:text-text",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {warn ? <AlertTriangle className="size-3" aria-hidden /> : null}
    </button>
  );
}

function AutomationPill({
  icon,
  label,
  on,
  allowed,
  billingHref,
  onOpen,
  onClear,
  hint,
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  allowed: boolean;
  billingHref: string;
  onOpen: () => void;
  onClear: () => void;
  hint: string;
}) {
  if (!allowed) {
    return (
      <Link
        href={billingHref}
        title={`${hint}. Available on paid plans.`}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-muted transition-colors hover:bg-bg-muted hover:text-text touch:h-10"
      >
        <Lock className="size-3" aria-hidden />
        {label}
        <span className="sr-only">: upgrade to use it</span>
      </Link>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md text-xs font-medium transition-colors touch:h-10",
        on ? "bg-accent/10 text-text" : "text-text-muted hover:bg-bg-muted hover:text-text",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        title={hint}
        className={cn(
          "inline-flex h-full items-center gap-1.5 rounded-md pl-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          on ? "pr-1" : "pr-2",
        )}
      >
        {icon}
        {label}
      </button>
      {on ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Turn off ${label}`}
          className="mr-1 inline-flex size-5 items-center justify-center rounded text-text-muted hover:bg-bg-muted hover:text-text"
        >
          <XIcon className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

function usePinterestBoards(accountId: string | undefined) {
  return useQuery({
    queryKey: ["pinterest-boards", accountId],
    enabled: !!accountId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetchApi(`/api/pinterest/boards?accountId=${encodeURIComponent(accountId!)}`);
      const data = (await res.json().catch(() => ({}))) as { boards?: { id: string; name: string }[] };
      return res.ok ? (data.boards ?? []) : [];
    },
  });
}

function PinterestPill({
  refEl,
  accounts,
  settings,
  active,
  warn,
  onClick,
}: {
  refEl: RefObject<HTMLButtonElement | null>;
  accounts: ComposerAccount[];
  settings: Record<string, PinterestPostSettings>;
  active: boolean;
  warn: boolean;
  onClick: () => void;
}) {
  const first = accounts[0];
  const boards = usePinterestBoards(accounts.length === 1 ? first?.id : undefined);
  const boardId = first ? settings[first.id]?.boardId : "";
  const name = boards.data?.find((b) => b.id === boardId)?.name;
  const label =
    accounts.length > 1
      ? `Pinterest boards (${accounts.length})`
      : boardId
        ? `Pinterest board: ${name ?? "selected"}`
        : "Pinterest: pick a board";
  return (
    <Pill
      refEl={refEl}
      icon={<NetworkIcon network="pinterest" size={12} label="" />}
      label={label}
      active={active}
      warn={warn}
      onClick={onClick}
    />
  );
}

function TikTokPanel({
  accounts,
  settings,
  onChange,
  mediaType,
  videoDurationSec,
  onMaxDuration,
  autoAddMusic,
  onAutoAddMusic,
}: {
  accounts: ComposerAccount[];
  settings: Record<string, TikTokPostSettings>;
  onChange: (id: string, s: TikTokPostSettings) => void;
  mediaType: "photo" | "video";
  videoDurationSec: number | null;
  onMaxDuration: (id: string, seconds: number) => void;
  autoAddMusic: boolean | null;
  onAutoAddMusic: (on: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const account = accounts[Math.min(index, accounts.length - 1)];
  if (!account) return null;
  return (
    <div className="space-y-3">
      {accounts.length > 1 ? (
        <AccountTabs accounts={accounts} selectedIndex={index} onSelect={setIndex} />
      ) : null}
      <TikTokSettings
        key={account.id}
        accountId={account.id}
        value={settings[account.id] ?? DEFAULT_TIKTOK_POST_SETTINGS}
        onChange={(s) => onChange(account.id, s)}
        onCreatorInfoLoaded={(info) => {
          if (info.max_video_duration != null) onMaxDuration(account.id, info.max_video_duration);
        }}
        mediaType={mediaType}
        videoDurationSec={videoDurationSec}
        showPreviewHint
      />
      {autoAddMusic != null ? (
        <Toggle
          checked={autoAddMusic}
          onCheckedChange={onAutoAddMusic}
          label="Auto add music"
          description="TikTok adds recommended music to your photos."
          className="border-t border-border pt-3"
        />
      ) : null}
    </div>
  );
}

function PinterestPanel({
  accounts,
  settings,
  setSettings,
}: {
  accounts: ComposerAccount[];
  settings: Record<string, PinterestPostSettings>;
  setSettings: React.Dispatch<React.SetStateAction<Record<string, PinterestPostSettings>>>;
}) {
  const [index, setIndex] = useState(0);
  return (
    <PinterestAccountSettings
      accounts={accounts}
      settingsByAccount={settings}
      setSettingsByAccount={setSettings}
      selectedAccountIndex={Math.min(index, accounts.length - 1)}
      setSelectedAccountIndex={setIndex}
    />
  );
}

function YouTubePanel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="composer-youtube-title" className="text-sm font-medium text-text">
        Video title
      </label>
      <input
        id="composer-youtube-title"
        value={value}
        maxLength={100}
        onChange={(e) => onChange(e.target.value.slice(0, 100))}
        placeholder="Defaults to the start of your caption"
        className="h-9 w-full rounded-lg border border-input bg-bg px-3 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <p className="text-right text-xs text-text-muted tabular-nums">
        {100 - value.length}/100 characters left
      </p>
    </div>
  );
}

function InstagramPanel({
  value,
  onChange,
}: {
  value: ComposerDraft["instagram"];
  onChange: (v: ComposerDraft["instagram"]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-text">Cover image</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Use an image as the reel cover instead of a video frame. Best: 9:16
          (1080×1920), JPEG, under 8 MB.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg px-3 text-xs font-medium text-text hover:bg-bg-muted disabled:opacity-60"
          >
            <ImagePlus className="size-3.5" aria-hidden />
            {uploading ? "Uploading…" : value.coverImageUrl ? "Replace cover" : "Upload cover"}
          </button>
          {value.coverImageUrl ? (
            <button
              type="button"
              onClick={() => {
                onChange({ ...value, coverImageUrl: undefined });
                setWarning(null);
              }}
              className="text-xs font-medium text-text-muted hover:text-text"
            >
              Remove cover
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError(null);
              setWarning(
                file.type.includes("jpeg") || file.type.includes("jpg")
                  ? null
                  : "Instagram recommends JPEG for reel covers.",
              );
              setUploading(true);
              try {
                const { url } = await uploadFile(file, 0);
                onChange({ ...value, coverImageUrl: url });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed. Try again.");
                onChange({ ...value, coverImageUrl: undefined });
                setWarning(null);
              } finally {
                setUploading(false);
              }
            }}
          />
        </div>
        {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}
        {warning ? <p className="mt-1 text-xs text-warning">{warning}</p> : null}
        {value.coverImageUrl ? (
          <div className="mt-2 flex items-center gap-2">
            <img
              src={value.coverImageUrl}
              alt="Reel cover"
              className="h-12 w-12 rounded border border-border object-cover"
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w && h && Math.abs(w / h - 9 / 16) > 0.05) {
                  setWarning((prev) =>
                    prev?.includes("9:16")
                      ? prev
                      : `${prev ? `${prev} ` : ""}For best results use 9:16 (1080×1920).`,
                  );
                }
              }}
            />
            <span className="text-xs font-medium text-accent">Cover set</span>
          </div>
        ) : null}
      </div>
      <Toggle
        checked={value.isTrialReel}
        onCheckedChange={(isTrialReel) => onChange({ ...value, isTrialReel })}
        label="Trial reel"
        description="Show it to non-followers first before sharing with everyone."
        className="border-t border-border pt-3"
      />
      <p className="text-xs text-text-muted">
        These apply when you publish now. Scheduled reels use the video&apos;s
        own cover.
      </p>
    </div>
  );
}
