import { useNavigate } from "react-router-dom";
import { setComposerPayload } from "@/lib/composer-bridge";
import { useDashboardPath } from "@/lib/dashboard-base-path";
import { cn } from "@/lib/utils";

export type SwitchablePostType = "text" | "image" | "video";

const OPTIONS: Array<{ slug: SwitchablePostType; label: string }> = [
  { slug: "text", label: "Text post" },
  { slug: "image", label: "Image post" },
  { slug: "video", label: "Video post" },
];

/**
 * Switch between text / image / video forms while carrying the caption via
 * the same in-memory composer bridge used by Composer → form redirects.
 * Media is never forwarded — callers should clear local media before navigate.
 */
export function SwitchPostTypeLinks({
  current,
  caption,
  onBeforeSwitch,
  className,
  draftId,
}: {
  current: SwitchablePostType;
  caption: string;
  onBeforeSwitch?: (target: SwitchablePostType) => void;
  className?: string;
  /** Keep editing this draft after switching type (from drafts). */
  draftId?: string;
}) {
  const navigate = useNavigate();
  const dash = useDashboardPath();
  const others = OPTIONS.filter((o) => o.slug !== current);

  const switchTo = (slug: SwitchablePostType) => {
    onBeforeSwitch?.(slug);
    setComposerPayload({
      text: caption.trim(),
      isThread: false,
      media: [],
    });
    const params = new URLSearchParams({ fromComposer: "1" });
    if (draftId) params.set("draft", draftId);
    navigate(`${dash(`create/${slug}`)}?${params}`);
  };

  return (
    <p
      className={cn(
        "text-sm text-text-muted",
        className,
      )}
    >
      Switch to:{" "}
      {others.map((option, index) => (
        <span key={option.slug}>
          {index > 0 ? <span> or </span> : null}
          <button
            type="button"
            onClick={() => switchTo(option.slug)}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            {option.label}
          </button>
        </span>
      ))}
    </p>
  );
}
