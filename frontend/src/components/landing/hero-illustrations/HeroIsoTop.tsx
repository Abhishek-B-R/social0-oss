import { C, ISO } from "./iso-tokens";

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

/** Top layer — isometric Social0 composer / dashboard window stack. */
export function HeroTopIllustration({
  width = 720,
  height = 420,
  className,
}: Props) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 720 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="s0-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={C.accentHot} stopOpacity="0" />
        </linearGradient>
        <filter id="s0-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      {/* Ambient glow under the stack */}
      <ellipse
        cx="360"
        cy="300"
        rx="220"
        ry="60"
        fill="url(#s0-glow)"
        filter="url(#s0-soft)"
        opacity="0.7"
      />

      {/* Back platform slab */}
      <rect
        width="280"
        height="200"
        rx="4"
        transform={ISO.top(280, 40)}
        fill={C.surface}
        stroke={C.strokeSoft}
      />
      <rect
        width="280"
        height="28"
        rx="2"
        transform={ISO.right(280 + 280 * 0.86603, 40 + 280 * 0.5)}
        fill={C.bg}
        stroke={C.strokeSoft}
      />
      <rect
        width="200"
        height="28"
        rx="2"
        transform={ISO.left(280 - 200 * 0.86603, 40 + 200 * 0.5)}
        fill={C.elevated}
        stroke={C.strokeSoft}
      />

      {/* Main dashboard window (top face content) */}
      <g transform={ISO.top(300, 70)}>
        <rect width="220" height="150" rx="6" fill={C.panel} stroke={C.stroke} />
        {/* Title bar */}
        <rect width="220" height="18" rx="6" fill={C.muted} />
        <circle cx="12" cy="9" r="3" fill="#ff5f57" />
        <circle cx="24" cy="9" r="3" fill="#febc2e" />
        <circle cx="36" cy="9" r="3" fill="#28c840" />
        {/* Sidebar */}
        <rect x="8" y="26" width="48" height="116" rx="4" fill={C.bg} />
        <rect x="14" y="34" width="36" height="6" rx="2" fill={C.accent} opacity="0.9" />
        <rect x="14" y="46" width="28" height="4" rx="1" fill={C.strokeSoft} />
        <rect x="14" y="56" width="32" height="4" rx="1" fill={C.strokeSoft} />
        <rect x="14" y="66" width="24" height="4" rx="1" fill={C.strokeSoft} />
        {/* Composer area */}
        <rect x="64" y="26" width="148" height="70" rx="4" fill={C.elevated} stroke={C.strokeSoft} />
        <rect x="72" y="34" width="80" height="5" rx="1.5" fill={C.strokeBright} opacity="0.5" />
        <rect x="72" y="44" width="120" height="4" rx="1" fill={C.strokeSoft} />
        <rect x="72" y="52" width="100" height="4" rx="1" fill={C.strokeSoft} />
        <rect x="72" y="60" width="60" height="4" rx="1" fill={C.strokeSoft} />
        <rect x="72" y="78" width="52" height="10" rx="3" fill={C.accent} />
        {/* Chart / calendar strip */}
        <rect x="64" y="104" width="70" height="38" rx="3" fill={C.bg} stroke={C.strokeSoft} />
        <rect x="72" y="128" width="8" height="8" rx="1" fill={C.accent} />
        <rect x="84" y="122" width="8" height="14" rx="1" fill={C.accentHot} opacity="0.7" />
        <rect x="96" y="118" width="8" height="18" rx="1" fill={C.accent} opacity="0.5" />
        <rect x="108" y="124" width="8" height="12" rx="1" fill={C.accentHot} opacity="0.85" />
        <rect x="142" y="104" width="70" height="38" rx="3" fill={C.bg} stroke={C.strokeSoft} />
        <circle cx="160" cy="123" r="10" fill="none" stroke={C.accent} strokeWidth="3" strokeDasharray="18 8" />
        <circle cx="188" cy="123" r="10" fill="none" stroke={C.strokeSoft} strokeWidth="3" />
      </g>

      {/* Floating status cubes — scheduled / live / queued */}
      <g>
        <rect
          width="56"
          height="40"
          rx="3"
          transform={ISO.top(520, 90)}
          fill={C.elevated}
          stroke={C.accent}
          strokeWidth="1.5"
        />
        <rect
          width="56"
          height="14"
          rx="1"
          transform={ISO.right(520 + 56 * 0.86603, 90 + 56 * 0.5)}
          fill={C.accentDim}
          stroke={C.accent}
        />
        <g transform={ISO.top(528, 100)}>
          <rect width="28" height="4" rx="1" fill={C.accentHot} />
          <rect y="8" width="40" height="3" rx="1" fill={C.strokeBright} opacity="0.4" />
          <rect y="14" width="32" height="3" rx="1" fill={C.strokeSoft} />
        </g>
      </g>

      <g>
        <rect
          width="48"
          height="36"
          rx="3"
          transform={ISO.top(160, 130)}
          fill={C.panel}
          stroke={C.strokeBright}
        />
        <rect
          width="48"
          height="12"
          rx="1"
          transform={ISO.right(160 + 48 * 0.86603, 130 + 48 * 0.5)}
          fill={C.muted}
          stroke={C.stroke}
        />
        <g transform={ISO.top(168, 138)}>
          <circle cx="8" cy="8" r="5" fill={C.accent} opacity="0.9" />
          <rect x="18" y="5" width="20" height="3" rx="1" fill={C.strokeBright} opacity="0.5" />
          <rect x="18" y="11" width="14" height="3" rx="1" fill={C.strokeSoft} />
        </g>
      </g>

      {/* Accent node connectors */}
      <path
        d="M250 200 L300 170"
        stroke={C.accent}
        strokeWidth="1.5"
        strokeDasharray="4 4"
        opacity="0.6"
      />
      <path
        d="M480 160 L520 130"
        stroke={C.accentHot}
        strokeWidth="1.5"
        strokeDasharray="4 4"
        opacity="0.5"
      />

      {/* Small brand cube */}
      <rect
        width="36"
        height="36"
        rx="2"
        transform={ISO.top(400, 250)}
        fill={C.accent}
        stroke={C.accentHot}
      />
      <rect
        width="36"
        height="16"
        rx="1"
        transform={ISO.right(400 + 36 * 0.86603, 250 + 36 * 0.5)}
        fill={C.accentDim}
        stroke={C.accent}
      />
      <rect
        width="36"
        height="16"
        rx="1"
        transform={ISO.left(400 - 36 * 0.86603, 250 + 36 * 0.5)}
        fill={C.accentDeep}
        stroke={C.accent}
      />
    </svg>
  );
}
