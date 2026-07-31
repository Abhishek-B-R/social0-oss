import Image from "@/components/AppImage";

/**
 * Floating official Social0 mark — circular (light) / dark logo by theme.
 * CSS animation (not Framer) so the DOM isn't rewritten every frame.
 */
export function HeroFloatingBrand({ className }: { className?: string }) {
  return (
    <div
      className={`landing-brand-float flex items-center ${className ?? ""}`}
      aria-hidden
    >
      <span className="relative block h-10 w-10 drop-shadow-[0_0_16px_rgba(16,185,129,0.4)] sm:h-11 sm:w-11">
        <Image
          src="/logo-circular.png"
          alt=""
          width={44}
          height={44}
          className="h-full w-full rounded-full dark:hidden"
        />
        <Image
          src="/logo-dark.png"
          alt=""
          width={44}
          height={44}
          className="absolute inset-0 hidden h-full w-full rounded-full border border-white/15 dark:block"
        />
      </span>
    </div>
  );
}
