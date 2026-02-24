"use client";

import { useState } from "react";
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
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClass = sizeClasses[size];

  const initial =
    username?.charAt(0)?.toUpperCase() ||
    platform?.charAt(0)?.toUpperCase() ||
    "?";

  const showImage = profileImageUrl?.trim() && !imageFailed;

  if (showImage) {
    return (
      <span className={cn("relative inline-block", sizeClass, className)}>
        <img
          src={profileImageUrl!}
          alt={username || platform || "Account"}
          className={cn("rounded-full object-cover shrink-0 h-full w-full", sizeClass)}
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gray-200 text-gray-600 font-semibold shrink-0",
        sizeClass,
        className
      )}
      title={username || platform || "Account"}
    >
      {initial}
    </div>
  );
}
