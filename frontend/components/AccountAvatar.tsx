"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type AccountAvatarProps = {
  profileImageUrl: string | null | undefined;
  username?: string | null;
  /** Platform id for placeholder initial (e.g. "pinterest" -> "P") */
  platform?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

export function AccountAvatar({
  profileImageUrl,
  username,
  platform,
  size = "md",
  className,
}: AccountAvatarProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = sizeClasses[size];

  const initial =
    username?.charAt(0)?.toUpperCase() ||
    platform?.charAt(0)?.toUpperCase() ||
    "?";

  // Reset failed state when URL changes
  useEffect(() => setFailed(false), [profileImageUrl]);

  if (profileImageUrl?.trim() && !failed) {
    return (
      <img
        src={profileImageUrl}
        alt={username || platform || "Account"}
        referrerPolicy="no-referrer"
        draggable={false}
        className={cn(
          "rounded-full object-cover shrink-0",
          sizeClass,
          className,
        )}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-semibold shrink-0",
        sizeClass,
        className,
      )}
      title={username || platform || "Account"}
    >
      {initial}
    </div>
  );
}
