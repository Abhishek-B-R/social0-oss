import { useMemo, useState, type ReactNode } from "react";
import AppImage from "@/components/AppImage";
import { InlineError, NetworkIcon, Skeleton, Tabs, networkLabel } from "@/components/app";
import { cn } from "@/lib/utils";
import type { ListPublication, ThreadPart } from "./posts-model";

export type PreviewMedia = {
  id: string;
  originalFilename: string;
  mimeType: string;
  url: string | null;
  thumbnailUrl: string | null;
};

function MediaTile({ m, large }: { m: PreviewMedia; large?: boolean }) {
  const isVideo = m.mimeType.startsWith("video/");
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-bg-muted",
        large ? "aspect-[4/5] max-h-80 w-full" : "aspect-square",
      )}
    >
      {isVideo ? (
        <video
          src={m.url ?? undefined}
          poster={m.thumbnailUrl ?? undefined}
          className="h-full w-full object-cover"
          controls
          muted
          playsInline
          preload="metadata"
          aria-label={m.originalFilename}
        />
      ) : (
        <AppImage
          src={m.thumbnailUrl ?? m.url ?? ""}
          alt={m.originalFilename}
          fill
          sizes="(max-width: 1024px) 90vw, 320px"
          className="object-cover"
          unoptimized
        />
      )}
    </div>
  );
}

function MediaGrid({ media }: { media: PreviewMedia[] }) {
  if (media.length === 0) return null;
  if (media.length === 1) return <MediaTile m={media[0]!} large />;
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {shown.map((m, i) => (
        <div key={m.id} className="relative">
          <MediaTile m={m} />
          {extra > 0 && i === shown.length - 1 ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-sm font-semibold text-white">
              +{extra}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Caption({ text }: { text: string }) {
  return text ? (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text">{text}</p>
  ) : (
    <p className="text-[13px] italic text-text-muted">No caption</p>
  );
}

/**
 * Right-column preview (mock 06·A): the post as written, switchable per
 * account when an account has its own caption or thread.
 */
export function PostPreviewCard({
  parts,
  mainCaption,
  metadata,
  media,
  mediaLoading,
  mediaError,
  onRetryMedia,
  publications,
}: {
  parts: ThreadPart[];
  mainCaption: string;
  metadata: Record<string, unknown> | null;
  media: PreviewMedia[];
  mediaLoading: boolean;
  mediaError: boolean;
  onRetryMedia: () => void;
  publications: ListPublication[];
}) {
  const accountCaptions = useMemo(() => {
    const raw = metadata?.accountCaptions;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  }, [metadata]);

  const tabs = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: string; label: ReactNode; pub: ListPublication | null }[] = [
      { value: "main", label: "Main", pub: null },
    ];
    for (const p of publications) {
      const key = p.connectedAccountId ?? p.publicationId;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        value: key,
        label: (
          <span className="inline-flex items-center gap-1">
            <NetworkIcon network={p.platform} size={12} label="" />
            {networkLabel(p.platform)}
          </span>
        ),
        pub: p,
      });
    }
    return out;
  }, [publications]);

  const [tab, setTab] = useState("main");
  const active = tabs.find((t) => t.value === tab) ?? tabs[0]!;
  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const isThread = parts.length > 1;

  const custom =
    active.pub?.connectedAccountId != null &&
    typeof accountCaptions[active.pub.connectedAccountId] === "string"
      ? (accountCaptions[active.pub.connectedAccountId] as string)
      : null;
  const showThread = isThread && (active.pub == null || active.pub.platform === "twitter_x" || !custom);

  // Media referenced by thread parts shows under its part; the rest below.
  const partMediaIds = new Set(parts.flatMap((p) => p.mediaIds));
  const looseMedia = showThread ? media.filter((m) => !partMediaIds.has(m.id)) : media;

  return (
    <section aria-label="Preview" className="rounded-xl border border-border bg-bg-elevated">
      {tabs.length > 2 || (tabs.length === 2 && Object.keys(accountCaptions).length > 0) ? (
        <div className="border-b border-border px-3 pt-2">
          <Tabs
            aria-label="Preview for"
            items={tabs.map((t) => ({ value: t.value, label: t.label }))}
            value={active.value}
            onChange={setTab}
            className="border-b-0"
          />
        </div>
      ) : null}
      <div className="space-y-3 p-4">
        {active.pub ? (
          <p className="text-xs font-medium text-text-muted">
            {custom
              ? `Custom caption for ${active.pub.platformUsername ? `@${active.pub.platformUsername.replace(/^@/, "")}` : networkLabel(active.pub.platform)}`
              : "Same caption as Main"}
          </p>
        ) : null}

        {showThread ? (
          <ol className="relative space-y-2">
            {parts.map((part, i) => {
              const pm = part.mediaIds.map((id) => mediaById.get(id)).filter((m): m is PreviewMedia => !!m);
              return (
                <li key={i} className="relative rounded-lg border border-border bg-bg-subtle p-3">
                  {i < parts.length - 1 ? (
                    <span aria-hidden className="absolute -bottom-2 left-5 h-2 w-px bg-border" />
                  ) : null}
                  <span className="mb-1 block text-xs font-medium text-text-muted">
                    {i + 1}/{parts.length}
                  </span>
                  <Caption text={part.text} />
                  {pm.length > 0 ? (
                    <div className="mt-2">
                      <MediaGrid media={pm} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <Caption text={custom ?? mainCaption} />
        )}

        {mediaLoading ? (
          <Skeleton className="aspect-[4/5] max-h-80 w-full rounded-lg" />
        ) : mediaError ? (
          <InlineError message="Couldn't load the media." onRetry={onRetryMedia} />
        ) : (
          <MediaGrid media={looseMedia} />
        )}
      </div>
    </section>
  );
}
