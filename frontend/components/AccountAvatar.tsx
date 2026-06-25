"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { accountAvatarSrc } from "@/lib/account-avatar-url";

type AccountAvatarProps = {
  profileImageUrl: string | null | undefined;
  /** When set, FB/IG avatars load via /api/accounts/:id/avatar (fresh from Graph API). */
  accountId?: string;
  username?: string | null;
  /** Platform id for placeholder initial and Premium badge (e.g. "twitter_x") */
  platform?: string;
  /** When true and platform is twitter_x, shows blue checkmark badge */
  isTwitterPremium?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeMap = { sm: 32, md: 36, lg: 48 };

export function AccountAvatar({
  profileImageUrl,
  accountId,
  username,
  platform,
  isTwitterPremium = false,
  size = "md",
  className,
}: AccountAvatarProps) {
  const [failed, setFailed] = useState(false);
  const px = sizeMap[size];
  const src = accountAvatarSrc(accountId, platform, profileImageUrl);

  const initial =
    username?.charAt(0)?.toUpperCase() ||
    platform?.charAt(0)?.toUpperCase() ||
    "?";

  // Reset failed state when URL changes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setFailed(false), [src]);

  const showPremiumBadge = platform === "twitter_x" && isTwitterPremium;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: px, height: px }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={username || platform || "Account"}
          referrerPolicy="no-referrer"
          draggable={false}
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full bg-bg-muted text-text-muted font-semibold text-xs"
          title={username || platform || "Account"}
        >
          {initial}
        </div>
      )}
      {showPremiumBadge && (
        <img
          src="/icons/twitter-premium.svg"
          alt="X Premium"
          className="absolute top-7 -right-[12px] z-10"
          style={{ width: px * 0.3, height: px * 0.3 }}
        />
      )}
    </div>
  );
}
