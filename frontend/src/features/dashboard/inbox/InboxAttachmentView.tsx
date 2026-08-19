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
  const [broken, setBroken] = useState(false);
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
        onError={() => setBroken(true)}
        className={cn(
          "mt-1.5 max-h-72 w-auto max-w-full rounded-lg object-contain",
          className,
        )}
      />
    );
  }

  return (
    <video
      src={attachment.url}
      controls
      playsInline
      preload="metadata"
      poster={attachment.thumbnailUrl ?? undefined}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn(
        "mt-1.5 max-h-72 w-full rounded-lg bg-black/80 object-contain",
        className,
      )}
    />
  );
}
