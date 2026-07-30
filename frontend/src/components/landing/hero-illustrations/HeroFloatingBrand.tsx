import { motion } from "framer-motion";
import { C, ISO } from "./iso-tokens";

/** Floating brand cube that gently bobs — clearly reads as S0 (zero). */
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
        fill={C.accentDeep}
        stroke={C.accent}
      />
      {/* Hand-drawn S0 so the zero never reads as "o" */}
      <g transform="translate(42 28)" fill="#04140c">
        <text
          x="18"
          y="26"
          textAnchor="middle"
          fontSize="22"
          fontWeight="800"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          letterSpacing="-0.04em"
        >
          S0
        </text>
      </g>
    </motion.svg>
  );
}
