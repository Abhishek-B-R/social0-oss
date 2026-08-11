import type { ReactNode } from "react";

/** Stages a product wireframe with subtle 3D tilt + glow — Fynt/Linear energy. */
export function WireframeStage({
  children,
  className = "",
  tall = false,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  tall?: boolean;
  /** Larger frame for product-moment rows */
  wide?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-[#f7f7f8] dark:border-white/8 dark:bg-[var(--iso-bg)] ${
        tall ? "min-h-[220px]" : "min-h-[160px]"
      } ${className}`}
    >
      {/* faint grid — stronger in light so it reads on pale cards */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--iso-stroke-soft) 1px, transparent 1px), linear-gradient(90deg, var(--iso-stroke-soft) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(ellipse at 50% 40%, black 20%, transparent 75%)",
        }}
        aria-hidden
      />
      {/* emerald ambient */}
      <div
        className="pointer-events-none absolute -bottom-8 left-1/2 h-24 w-48 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-2xl dark:bg-emerald-400/20"
        aria-hidden
      />
      <div
        className="relative flex h-full items-center justify-center p-4 sm:p-5"
        style={{
          perspective: "900px",
        }}
      >
        <div
          className={`w-full transition-transform duration-300 ease-out will-change-transform group-hover:[transform:rotateX(2deg)_rotateY(-6deg)_translateY(-2px)] ${
            wide ? "max-w-[400px]" : "max-w-[320px]"
          }`}
          style={{
            transform: "rotateX(4deg) rotateY(-8deg)",
            transformStyle: "preserve-3d",
          }}
        >
          <div className="rounded-[14px] shadow-[0_18px_40px_-14px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.08)] dark:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
