import { motion } from "framer-motion";
import { C, ISO } from "./iso-tokens";

/** Floating brand cube that gently bobs above the hero stack. */
export function HeroFloatingBrand({ className }: { className?: string }) {
  return (
    <motion.svg
      width="120"
      height="110"
      viewBox="0 0 120 110"
      fill="none"
      className={className}
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
      <defs>
        <linearGradient id="s0-float" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.accentHot} />
          <stop offset="100%" stopColor={C.accentDim} />
        </linearGradient>
      </defs>
      <rect
        width="64"
        height="64"
        rx="4"
        transform={ISO.top(40, 8)}
        fill="url(#s0-float)"
        stroke={C.accentHot}
      />
      <rect
        width="64"
        height="22"
        rx="2"
        transform={ISO.right(40 + 64 * 0.86603, 8 + 64 * 0.5)}
        fill={C.accentDim}
        stroke={C.accent}
      />
      <rect
        width="64"
        height="22"
        rx="2"
        transform={ISO.left(40 - 64 * 0.86603, 8 + 64 * 0.5)}
        fill="#047857"
        stroke={C.accent}
      />
      <text
        x="56"
        y="48"
        textAnchor="middle"
        fill="#04140c"
        fontSize="18"
        fontWeight="700"
        fontFamily="Georgia, serif"
        transform="skewX(-12)"
      >
        S0
      </text>
    </motion.svg>
  );
}
