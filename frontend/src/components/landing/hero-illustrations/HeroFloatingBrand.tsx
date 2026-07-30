import { motion } from "framer-motion";
import Image from "@/components/AppImage";

/**
 * Floating official Social0 mark — circular (light) / dark logo by theme.
 * Sized to match prior in-scale appearance (~40–44px); stays outside iso remount.
 */
export function HeroFloatingBrand({ className }: { className?: string }) {
  return (
    <motion.div
      className={`flex items-center ${className ?? ""}`}
      aria-hidden
      initial={{ y: 0 }}
      animate={{ y: -8 }}
      transition={{
        duration: 2.2,
        repeat: Infinity,
        repeatType: "reverse",
        ease: "easeInOut",
      }}
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
    </motion.div>
  );
}
