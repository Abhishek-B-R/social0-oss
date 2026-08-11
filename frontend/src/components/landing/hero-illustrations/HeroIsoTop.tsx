import { C, ISO, LOGO_PATHS } from "./iso-tokens";

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

function Logo({
  logo,
  x,
  y,
  size = 10,
}: {
  logo: keyof typeof LOGO_PATHS;
  x: number;
  y: number;
  size?: number;
}) {
  if (logo === "x") {
    const pad = size * 0.2;
    const glyph = size * 0.6;
    const gs = glyph / 24;
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect width={size} height={size} rx={size * 0.22} fill="#0E0E0E" />
        <g transform={`translate(${pad} ${pad}) scale(${gs})`}>
          <path d={LOGO_PATHS.x} fill="#ffffff" />
        </g>
      </g>
    );
  }

  const s = size / 24;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={LOGO_PATHS[logo]} fill={C.accent} />
    </g>
  );
}

/** Top layer — detailed Social0 composer + sidebar dashboard (product-faithful). */
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
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.4" />
          <stop offset="100%" stopColor={C.accentHot} stopOpacity="0" />
        </linearGradient>
        <filter id="s0-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      <ellipse
        cx="360"
        cy="310"
        rx="240"
        ry="55"
        fill="url(#s0-glow)"
        filter="url(#s0-soft)"
        opacity="0.65"
      />

      {/* Shift so composer window centers on the stack axis (middle hub) */}
      <g transform="translate(68 0)">
      {/* Main app window */}
      <g transform={ISO.top(290, 55)}>
        <rect
          width="260"
          height="175"
          rx="8"
          fill={C.panel}
          stroke={C.stroke}
          strokeWidth="1.25"
        />
        {/* Title bar */}
        <rect width="260" height="20" rx="8" fill={C.muted} />
        <rect y="12" width="260" height="8" fill={C.muted} />
        <circle cx="12" cy="10" r="3.2" fill="#ff5f57" />
        <circle cx="24" cy="10" r="3.2" fill="#febc2e" />
        <circle cx="36" cy="10" r="3.2" fill="#28c840" />
        <text
          x="130"
          y="13"
          textAnchor="middle"
          fill={C.strokeBright}
          fontSize="7"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontWeight="500"
          opacity="0.7"
        >
          Social0 · Composer
        </text>

        {/* Sidebar */}
        <rect x="8" y="28" width="56" height="139" rx="5" fill={C.bg} />
        <rect x="14" y="36" width="44" height="12" rx="4" fill={C.accent} />
        <text
          x="36"
          y="44"
          textAnchor="middle"
          fill={C.inkInverse}
          fontSize="6"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontWeight="700"
        >
          Create
        </text>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect
            key={i}
            x="14"
            y={56 + i * 14}
            width={i === 0 ? 36 : 28 + (i % 2) * 8}
            height="5"
            rx="1.5"
            fill={i === 0 ? C.strokeBright : C.strokeSoft}
            opacity={i === 0 ? 0.7 : 0.55}
          />
        ))}

        {/* Composer card */}
        <rect
          x="72"
          y="28"
          width="178"
          height="88"
          rx="6"
          fill={C.elevated}
          stroke={C.strokeSoft}
        />
        <text
          x="82"
          y="44"
          fill={C.ink}
          fontSize="8"
          fontFamily="Georgia, serif"
          fontStyle="italic"
        >
          Composer
        </text>
        <rect
          x="82"
          y="52"
          width="156"
          height="36"
          rx="4"
          fill={C.panel}
          stroke={C.strokeSoft}
        />
        <rect x="90" y="60" width="90" height="3.5" rx="1" fill={C.strokeSoft} />
        <rect x="90" y="68" width="120" height="3.5" rx="1" fill={C.strokeSoft} />
        <rect x="90" y="76" width="70" height="3.5" rx="1" fill={C.strokeSoft} />
        {/* chips */}
        <rect
          x="82"
          y="96"
          width="48"
          height="12"
          rx="6"
          fill={C.bg}
          stroke={C.strokeSoft}
        />
        <rect
          x="136"
          y="96"
          width="52"
          height="12"
          rx="6"
          fill={C.accent}
          opacity="0.2"
          stroke={C.accent}
        />
        <rect x="196" y="94" width="46" height="16" rx="6" fill={C.accent} />
        <text
          x="219"
          y="105"
          textAnchor="middle"
          fill={C.inkInverse}
          fontSize="6.5"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontWeight="700"
        >
          Continue
        </text>

        {/* Bottom: calendar + accounts */}
        <rect
          x="72"
          y="124"
          width="84"
          height="43"
          rx="5"
          fill={C.bg}
          stroke={C.strokeSoft}
        />
        {[0, 1, 2, 3].map((c) => (
          <rect
            key={c}
            x={80 + c * 16}
            y="138"
            width="10"
            height="8"
            rx="1.5"
            fill={c === 2 ? C.accent : C.muted}
          />
        ))}
        {[0, 1, 2, 3].map((c) => (
          <rect
            key={`r2-${c}`}
            x={80 + c * 16}
            y="150"
            width="10"
            height="8"
            rx="1.5"
            fill={c === 0 ? C.accentHot : C.muted}
            opacity={c === 0 ? 0.85 : 1}
          />
        ))}

        <rect
          x="164"
          y="124"
          width="86"
          height="43"
          rx="5"
          fill={C.bg}
          stroke={C.strokeSoft}
        />
        {(["x", "ig", "li", "yt"] as const).map((logo, i) => (
          <g key={logo}>
            <circle
              cx={178 + i * 18}
              cy="145"
              r="7"
              fill={C.elevated}
              stroke={C.accent}
              strokeWidth="1"
            />
            <Logo logo={logo} x={173 + i * 18} y={140} size={10} />
          </g>
        ))}
      </g>

      {/* Floating scheduled card — left of brand mark */}
      <g transform={ISO.top(470, 70)}>
        <rect
          width="72"
          height="48"
          rx="4"
          fill={C.elevated}
          stroke={C.accent}
          strokeWidth="1.5"
        />
        <rect x="10" y="12" width="36" height="5" rx="1.5" fill={C.accentHot} />
        <rect x="10" y="22" width="48" height="3.5" rx="1" fill={C.strokeBright} opacity="0.45" />
        <rect x="10" y="30" width="40" height="3.5" rx="1" fill={C.strokeSoft} />
        <rect x="10" y="38" width="28" height="8" rx="3" fill={C.accent} />
      </g>

      {/* Floating account chip — flat, no side extrusion */}
      <g transform={ISO.top(150, 120)}>
        <rect
          width="56"
          height="40"
          rx="4"
          fill={C.panel}
          stroke={C.strokeBright}
        />
        <circle cx="18" cy="20" r="7" fill={C.accent} opacity="0.9" />
        <rect x="30" y="16" width="24" height="3.5" rx="1" fill={C.strokeBright} opacity="0.5" />
        <rect x="30" y="23" width="16" height="3" rx="1" fill={C.strokeSoft} />
      </g>
      </g>
    </svg>
  );
}
