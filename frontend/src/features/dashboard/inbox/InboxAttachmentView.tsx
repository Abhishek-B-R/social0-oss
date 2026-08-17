import type { InboxAttachment } from "@/api/inbox";
import { cn } from "@/lib/utils";

export function InboxAttachmentView({
  attachment,
  className,
}: {
  attachment: InboxAttachment;
  className?: string;
}) {
  if (attachment.type === "image") {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        className={cn("mt-1.5 block overflow-hidden rounded-lg", className)}
      >
        <img
          src={attachment.url}
          alt=""
          className="max-h-56 w-full object-cover"
          referrerPolicy="no-referrer"
        />
      </a>
    );
  }
  return (
    <div className={cn("mt-1.5 overflow-hidden rounded-lg", className)}>
      <video
        src={attachment.url}
        controls
        playsInline
        preload="metadata"
        poster={attachment.thumbnailUrl ?? undefined}
        className="max-h-56 w-full bg-black/20"
      />
    </div>
  );
}
