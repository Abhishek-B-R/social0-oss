"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

/** Brand-aligned floating create button: green core + subtle dual glow. Premium SaaS, not neon. */
const TOKENS = {
  width: 56,
  height: 40,
  /** Horizontal offset (px) for glow layers — subtle, not flashy */
  glowOffset: 2,
} as const;

type CreateButtonProps = {
  href: string;
  isActive?: boolean;
  "aria-label"?: string;
};

/**
 * Brand-aligned floating center action button for bottom nav.
 * Keeps layered depth and floating feel; uses green-based styling to match the product.
 * Two soft glow layers (darker + lighter green) + green core + white icon.
 */
export function TiktokCreateButton({
  href,
  isActive = false,
  "aria-label": ariaLabel = "Create post",
}: CreateButtonProps) {
  return (
    <Link
      href={href}
      className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center justify-end touch-manipulation"
      aria-label={ariaLabel}
      aria-current={isActive ? "page" : undefined}
    >
      <div
        className="relative flex items-center justify-center transition-all duration-150 active:scale-95"
        style={{
          width: TOKENS.width,
          height: TOKENS.height,
        }}
      >
        {/* Left glow — darker green, subtle */}
        <div
          className="absolute inset-0 rounded-xl bg-emerald-500/60 blur-sm"
          style={{ transform: `translateX(-${TOKENS.glowOffset}px)` }}
          aria-hidden
        />
        {/* Right glow — lighter green / teal, subtle */}
        <div
          className="absolute inset-0 rounded-xl bg-emerald-300/60 blur-sm"
          style={{ transform: `translateX(${TOKENS.glowOffset}px)` }}
          aria-hidden
        />
        {/* Main button — primary green, clean */}
        <div className="relative flex h-full w-full items-center justify-center rounded-xl bg-accent shadow-lg shadow-emerald-500/30">
          <Plus
            className="h-5 w-5 shrink-0 stroke-[2.5] text-white"
            strokeWidth={2.5}
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}
