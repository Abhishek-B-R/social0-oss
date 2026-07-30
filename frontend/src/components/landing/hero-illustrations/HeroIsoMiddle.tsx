import { C, ISO, LOGO_PATHS } from "./iso-tokens";

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

type Pad = {
  x: number;
  y: number;
  logo: keyof typeof LOGO_PATHS;
  accent?: boolean;
};

/** Middle layer — isometric platform hub with official logos. */
export function HeroMiddleIllustration({
  width = 520,
  height = 340,
  className,
}: Props) {
  const pads: Pad[] = [
    { x: 260, y: 70, logo: "x" },
    { x: 160, y: 130, logo: "ig" },
    { x: 360, y: 130, logo: "li", accent: true },
    { x: 260, y: 190, logo: "yt" },
    { x: 120, y: 210, logo: "tt" },
    { x: 400, y: 210, logo: "fb" },
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
        stroke={C.ink}
      />
      <path
        d="M2 140c0-1.1.78-1.55 1.73-1L246 280c.96.55 1.73 1.89 1.73 3v42c0 1.1-.78 1.55-1.73 1L3.73 185c-.96-.55-1.73-1.89-1.73-3z"
        fill={C.panel}
        stroke={C.strokeSoft}
        transform="translate(8 8)"
      />

      {pads.map((p) => (
        <g key={p.logo + p.x}>
          <path
            d={`M${p.x} ${p.y - 22}
               L${p.x + 38} ${p.y}
               L${p.x} ${p.y + 22}
               L${p.x - 38} ${p.y} Z`}
            fill={p.accent ? C.accent : C.mid}
            stroke={p.accent ? C.accentHot : C.ink}
            strokeDasharray={p.accent ? undefined : "2 2"}
            strokeWidth={p.accent ? 1.5 : 1}
            opacity={0.95}
          />
          {p.accent && (
            <>
              <path
                d={`M${p.x + 38} ${p.y} L${p.x + 38} ${p.y + 10} L${p.x} ${p.y + 32} L${p.x} ${p.y + 22} Z`}
                fill={C.accentDim}
                stroke={C.accent}
              />
              <path
                d={`M${p.x - 38} ${p.y} L${p.x - 38} ${p.y + 10} L${p.x} ${p.y + 32} L${p.x} ${p.y + 22} Z`}
                fill={C.accentDeep}
                stroke={C.accent}
              />
            </>
          )}
          {/* Official logo, centered on pad */}
          <g transform={`translate(${p.x - 8} ${p.y - 8})`}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                d={LOGO_PATHS[p.logo]}
                fill={p.accent ? C.inkInverse : C.ink}
              />
            </svg>
          </g>
        </g>
      ))}

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
          opacity="0.45"
        />
      ))}
    </svg>
  );
}
