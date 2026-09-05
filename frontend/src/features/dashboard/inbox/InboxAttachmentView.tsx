import { useState } from "react";
import type { InboxAttachment } from "@/api/inbox";
import { cn } from "@/lib/utils";

export function InboxAttachmentView({
  attachment,
  className,
}: {
  attachment: InboxAttachment;
  className?: string;
}) {
  // Remember *which* URL failed rather than a bare boolean: when the slot is
  // reused for a different attachment the derived flag resets on its own, so
  // one broken URL cannot leave "Media unavailable" stuck on the next one.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = brokenUrl !== null && brokenUrl === attachment.url;

  if (broken || !attachment.url) {
    return (
      <p className="mt-1.5 text-[11px] text-text-muted">Media unavailable</p>
    );
  }

  if (attachment.type === "image") {
    return (
      <img
        src={attachment.url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBrokenUrl(attachment.url)}
        className={cn(
          "mt-1.5 max-h-72 w-auto max-w-full rounded-lg object-contain",
          className,
        )}
      />
    );
  }

  return (
    <video
      ref={(el) => {
        if (el) el.setAttribute("referrerpolicy", "no-referrer");
      }}
      src={attachment.url}
      controls
      playsInline
      preload="metadata"
      poster={attachment.thumbnailUrl ?? undefined}
      onError={() => setBrokenUrl(attachment.url)}
      className={cn(
        "mt-1.5 max-h-72 w-full rounded-lg bg-black/80 object-contain",
        className,
      )}
    />
  );
}
