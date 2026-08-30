import { AccountAvatar } from "@/components/AccountAvatar";
import { AccountPlatformMark } from "@/components/PlatformIcon";
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
      <AccountPlatformMark platform={platform} compact={size <= 32} />
    </span>
  );
}
