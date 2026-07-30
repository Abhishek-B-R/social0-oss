import { motion } from "framer-motion";
import Image from "@/components/AppImage";

/** Floating official Social0 mark — circular (light) / dark logo by theme. */
export function HeroFloatingBrand({ className }: { className?: string }) {
  return (
    <motion.div
      className={`flex flex-col items-center gap-2 ${className ?? ""}`}
      aria-hidden
      initial={{ y: 0 }}
      animate={{ y: -10 }}
      transition={{
        duration: 2.2,
        repeat: Infinity,
        repeatType: "reverse",
        ease: "easeInOut",
      }}
    >
      <span className="relative block h-16 w-16 drop-shadow-[0_0_20px_rgba(16,185,129,0.45)] sm:h-[72px] sm:w-[72px]">
        <Image
          src="/logo-circular.png"
          alt=""
          width={72}
          height={72}
          className="h-full w-full rounded-full dark:hidden"
        />
        <Image
          src="/logo-dark.png"
          alt=""
          width={72}
          height={72}
          className="absolute inset-0 hidden h-full w-full rounded-full border border-white/15 dark:block"
        />
      </span>
      <span className="text-[13px] font-semibold tracking-[0.06em] text-foreground">
        Social0
      </span>
    </motion.div>
  );
}
