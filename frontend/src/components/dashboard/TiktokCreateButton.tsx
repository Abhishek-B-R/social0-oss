
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { Plus } from "lucide-react";
import { useState } from "react";

/** Brand-aligned floating create button: green core + subtle dual glow. Premium SaaS, not neon. */
const TOKENS = {
  width: 56,
  // 44px is the minimum comfortable thumb target (WCAG 2.5.5 / Apple HIG).
  height: 44,
  /** Horizontal offset (px) for glow layers - subtle, not flashy */
  glowOffset: 2,
} as const;

type CreateButtonProps = {
  href: string;
  isActive?: boolean;
  /** Visible label under the + button (matches other bottom-nav tabs). */
  label?: string;
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
  label = "Create",
  "aria-label": ariaLabel,
}: CreateButtonProps) {
  const pathname = useLocation().pathname;
  const [navPending, setNavPending] = useState(false);
  const [pendingPath, setPendingPath] = useState(pathname);
  if (pendingPath !== pathname) {
    setPendingPath(pathname);
    setNavPending(false);
  }

  return (
    <Link
      href={href}
      prefetch
      onClick={() => {
        if (!isActive) setNavPending(true);
      }}
      className={`flex flex-col items-center justify-center touch-manipulation ${navPending ? "opacity-75" : ""}`}
      aria-label={ariaLabel ?? label}
      aria-current={isActive ? "page" : undefined}
    >
      <div
        className="relative flex items-center justify-center transition-all duration-150 active:scale-95"
        style={{
          width: TOKENS.width,
          height: TOKENS.height,
        }}
      >
        {/* Left glow - darker green, subtle */}
        <div
          className="absolute inset-0 rounded-xl bg-accent/60 blur-sm"
          style={{ transform: `translateX(-${TOKENS.glowOffset}px)` }}
          aria-hidden
        />
        {/* Right glow - lighter green / teal, subtle */}
        <div
          className="absolute inset-0 rounded-xl bg-accent-light/60 blur-sm"
          style={{ transform: `translateX(${TOKENS.glowOffset}px)` }}
          aria-hidden
        />
        {/* Main button - primary green, clean */}
        <div className="relative flex h-full w-full items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/30">
          <Plus
            className="h-5 w-5 shrink-0 stroke-[2.5] text-accent-foreground"
            strokeWidth={2.5}
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}
