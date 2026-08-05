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
  /** Tall solid pedestal under the tile (TikTok / Facebook). */
  pedestal?: boolean;
  /** Tile diamond size (default 36). */
  size?: number;
};

const HUB = { x: 270, y: 155 } as const;

function Pedestal({ x, y }: { x: number; y: number }) {
  // Match the thin depth of the flat platform tiles (~5), not a tall block.
  const s = 36;
  const halfW = s * 0.866;
  const halfH = s * 0.5;
  const depth = 5;
  return (
    <g>
      <path
        d={`M${x} ${y - halfH}
           L${x + halfW} ${y}
           L${x} ${y + halfH}
           L${x - halfW} ${y} Z`}
        fill={C.elevated}
        stroke={C.ink}
        strokeDasharray="2.5 2.5"
        strokeWidth="1.15"
      />
      <path
        d={`M${x + halfW} ${y} L${x + halfW} ${y + depth} L${x} ${y + halfH + depth} L${x} ${y + halfH} Z`}
        fill={C.muted}
        stroke={C.strokeSoft}
        strokeWidth="0.75"
        opacity="0.85"
      />
      <path
        d={`M${x - halfW} ${y} L${x - halfW} ${y + depth} L${x} ${y + halfH + depth} L${x} ${y + halfH} Z`}
        fill={C.bg}
        stroke={C.strokeSoft}
        strokeWidth="0.75"
        opacity="0.9"
      />
    </g>
  );
}

/** Spoke from hub ring out toward a pad (stops short of the tile). */
function spokeTo(pad: Pad, hubClear = 24, padClear = 22) {
  const dx = pad.x - HUB.x;
  const dy = pad.y - HUB.y;
  const len = Math.hypot(dx, dy) || 1;
  const t0 = hubClear / len;
  const t1 = 1 - padClear / len;
  return {
    x1: HUB.x + dx * t0,
    y1: HUB.y + dy * t0,
    x2: HUB.x + dx * t1,
    y2: HUB.y + dy * t1,
  };
}

/** Middle layer — isometric hub with square dashed pads + white platform logos. */
export function HeroMiddleIllustration({
  width = 540,
  height = 380,
  className,
}: Props) {
  // YouTube (bottom-left) + Pinterest (bottom-right) on separate radial spokes —
  // not stacked on the same vertical path.
  const pads: Pad[] = [
    { x: 270, y: 52, logo: "x" },
    { x: 155, y: 100, logo: "ig" },
    { x: 385, y: 100, logo: "li" },
    { x: 140, y: 165, logo: "bluesky" },
    { x: 400, y: 165, logo: "threads" },
    { x: 120, y: 220, logo: "tt", pedestal: true },
    { x: 420, y: 220, logo: "fb", pedestal: true },
    { x: 195, y: 250, logo: "yt", size: 42 },
    { x: 345, y: 250, logo: "pin", size: 42 },
  ];

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 540 380"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Hub top face only — no side extrusions */}
      <rect
        width="280"
        height="260"
        rx="3"
        transform={ISO.top(260, 18)}
        fill={C.surface}
        stroke={C.stroke}
      />

      {/* One dashed spoke per platform (drawn under pads) */}
      {pads.map((p) => {
        const s = spokeTo(p);
        return (
          <line
            key={`spoke-${p.logo}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={C.strokeBright}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.4"
          />
        );
      })}

      {pads.map((p) => {
        const s = p.size ?? 36;
        const halfW = s * 0.866;
        const halfH = s * 0.5;
        const logoOffset = s >= 40 ? 8 : 7;
        const logoPx = s >= 40 ? 15 : 14;
        return (
          <g key={p.logo}>
            {p.pedestal ? (
              <Pedestal x={p.x} y={p.y} />
            ) : (
              <>
                <path
                  d={`M${p.x} ${p.y - halfH}
                     L${p.x + halfW} ${p.y}
                     L${p.x} ${p.y + halfH}
                     L${p.x - halfW} ${p.y} Z`}
                  fill={C.elevated}
                  stroke={C.ink}
                  strokeDasharray="2.5 2.5"
                  strokeWidth="1.15"
                  opacity="0.98"
                />
                <path
                  d={`M${p.x + halfW} ${p.y} L${p.x + halfW} ${p.y + 5} L${p.x} ${p.y + halfH + 5} L${p.x} ${p.y + halfH} Z`}
                  fill={C.muted}
                  stroke={C.strokeSoft}
                  strokeWidth="0.75"
                  opacity="0.85"
                />
                <path
                  d={`M${p.x - halfW} ${p.y} L${p.x - halfW} ${p.y + 5} L${p.x} ${p.y + halfH + 5} L${p.x} ${p.y + halfH} Z`}
                  fill={C.bg}
                  stroke={C.strokeSoft}
                  strokeWidth="0.75"
                  opacity="0.9"
                />
              </>
            )}
            <g
              transform={`translate(${p.x - logoOffset} ${p.y - logoOffset - 1})`}
            >
              {p.logo === "x" ? (
                <svg width={logoPx} height={logoPx} viewBox={`0 0 ${logoPx} ${logoPx}`}>
                  <rect
                    width={logoPx}
                    height={logoPx}
                    rx={logoPx * 0.22}
                    fill="#0E0E0E"
                  />
                  <g
                    transform={`translate(${logoPx * 0.2} ${logoPx * 0.2}) scale(${(logoPx * 0.6) / 24})`}
                  >
                    <path d={LOGO_PATHS.x} fill="#ffffff" />
                  </g>
                </svg>
              ) : (
                <svg width={logoPx} height={logoPx} viewBox="0 0 24 24">
                  <path d={LOGO_PATHS[p.logo]} fill={C.ink} />
                </svg>
              )}
            </g>
          </g>
        );
      })}

      {/* Hub pulse */}
      <ellipse
        cx={HUB.x}
        cy={HUB.y}
        rx="30"
        ry="17"
        fill="none"
        stroke={C.accent}
        strokeWidth="1.25"
        opacity="0.45"
      />
      <ellipse
        cx={HUB.x}
        cy={HUB.y}
        rx="18"
        ry="10"
        fill="none"
        stroke={C.accent}
        strokeWidth="1.5"
        opacity="0.75"
      />
      <ellipse
        cx={HUB.x}
        cy={HUB.y}
        rx="8"
        ry="4.5"
        fill={C.accentHot}
        opacity="0.95"
      />
    </svg>
  );
}
