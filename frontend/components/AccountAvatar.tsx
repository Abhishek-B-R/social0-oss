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
  const sizeClass = sizeClasses[size];

  if (profileImageUrl?.trim()) {
    return (
      <img
        src={profileImageUrl}
        alt={username || platform || "Account"}
        className={cn("rounded-full object-cover shrink-0", sizeClass, className)}
      />
    );
  }

  const initial =
    username?.charAt(0)?.toUpperCase() ||
    platform?.charAt(0)?.toUpperCase() ||
    "?";

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
