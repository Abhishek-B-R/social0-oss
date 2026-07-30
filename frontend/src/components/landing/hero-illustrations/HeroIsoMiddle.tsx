import { C, ISO } from "./iso-tokens";

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

/** Middle layer — isometric platform hub / connection tray. */
export function HeroMiddleIllustration({
  width = 520,
  height = 340,
  className,
}: Props) {
  const pads: { x: number; y: number; label: string; accent?: boolean }[] = [
    { x: 260, y: 70, label: "X" },
    { x: 160, y: 130, label: "IG" },
    { x: 360, y: 130, label: "LI", accent: true },
    { x: 260, y: 190, label: "YT" },
    { x: 120, y: 210, label: "TT" },
    { x: 400, y: 210, label: "FB" },
  ];

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 520 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Large isometric tray */}
      <rect
        width="260"
        height="240"
        rx="3"
        transform={ISO.top(250, 20)}
        fill={C.surface}
        stroke={C.stroke}
      />
      <rect
        width="260"
        height="36"
        rx="2"
        transform={ISO.right(250 + 260 * 0.86603, 20 + 260 * 0.5)}
        fill={C.panel}
        stroke={C.white}
      />
      <path
        d="M2 140c0-1.1.78-1.55 1.73-1L246 280c.96.55 1.73 1.89 1.73 3v42c0 1.1-.78 1.55-1.73 1L3.73 185c-.96-.55-1.73-1.89-1.73-3z"
        fill={C.panel}
        stroke={C.strokeSoft}
        transform="translate(8 8)"
      />

      {/* Dashed diamond pads + labels */}
      {pads.map((p) => (
        <g key={p.label}>
          <path
            d={`M${p.x} ${p.y - 22}
               L${p.x + 38} ${p.y}
               L${p.x} ${p.y + 22}
               L${p.x - 38} ${p.y} Z`}
            fill={p.accent ? C.accent : C.mid}
            stroke={p.accent ? C.accentHot : C.white}
            strokeDasharray={p.accent ? undefined : "2 2"}
            strokeWidth={p.accent ? 1.5 : 1}
            opacity={0.95}
          />
          {/* Tiny extruded side for accent pad */}
          {p.accent && (
            <>
              <path
                d={`M${p.x + 38} ${p.y} L${p.x + 38} ${p.y + 10} L${p.x} ${p.y + 32} L${p.x} ${p.y + 22} Z`}
                fill={C.accentDim}
                stroke={C.accent}
              />
              <path
                d={`M${p.x - 38} ${p.y} L${p.x - 38} ${p.y + 10} L${p.x} ${p.y + 32} L${p.x} ${p.y + 22} Z`}
                fill="#047857"
                stroke={C.accent}
              />
            </>
          )}
          <text
            x={p.x}
            y={p.y + 4}
            textAnchor="middle"
            fill={p.accent ? C.bg : C.strokeBright}
            fontSize="11"
            fontFamily="system-ui, sans-serif"
            fontWeight="600"
          >
            {p.label}
          </text>
        </g>
      ))}

      {/* Center hub ring */}
      <ellipse
        cx="260"
        cy="155"
        rx="28"
        ry="16"
        fill="none"
        stroke={C.accent}
        strokeWidth="1.5"
        opacity="0.7"
      />
      <ellipse
        cx="260"
        cy="155"
        rx="12"
        ry="7"
        fill={C.accent}
        opacity="0.85"
      />

      {/* Connector dashes from hub to pads */}
      {[
        [260, 140, 260, 92],
        [245, 160, 190, 140],
        [275, 160, 330, 140],
        [260, 170, 260, 190],
      ].map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={C.strokeBright}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.35"
        />
      ))}
    </svg>
  );
}
