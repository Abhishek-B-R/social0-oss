import { AccountAvatar } from "@/components/AccountAvatar";
import { PlatformIcon } from "@/components/PlatformIcon";
import { cn } from "@/lib/utils";

export function InboxAvatar({
  profileImageUrl,
  username,
  platform,
  size = 28,
  className,
}: {
  profileImageUrl?: string | null;
  username?: string | null;
  platform: string;
  size?: number;
  className?: string;
}) {
  const badge = Math.max(10, Math.round(size * 0.38));
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span className="h-full w-full overflow-hidden rounded-full">
        <AccountAvatar
          profileImageUrl={profileImageUrl}
          username={username}
          platform={platform}
          fill
        />
      </span>
      <span
        className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border border-bg bg-bg-elevated shadow-sm"
        style={{ width: badge + 4, height: badge + 4 }}
      >
        <PlatformIcon platform={platform} size={badge} />
      </span>
    </span>
  );
}
