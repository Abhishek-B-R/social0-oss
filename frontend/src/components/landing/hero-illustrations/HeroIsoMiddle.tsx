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
};

function Pedestal({ x, y }: { x: number; y: number }) {
  const s = 40;
  const halfW = s * 0.866;
  const halfH = s * 0.5;
  const depth = 16;
  return (
    <g>
      <path
        d={`M${x} ${y - halfH}
           L${x + halfW} ${y}
           L${x} ${y + halfH}
           L${x - halfW} ${y} Z`}
        fill={C.elevated}
        stroke={C.ink}
        strokeWidth="1.15"
      />
      <path
        d={`M${x + halfW} ${y} L${x + halfW} ${y + depth} L${x} ${y + halfH + depth} L${x} ${y + halfH} Z`}
        fill={C.muted}
        stroke={C.stroke}
        strokeWidth="1"
      />
      <path
        d={`M${x - halfW} ${y} L${x - halfW} ${y + depth} L${x} ${y + halfH + depth} L${x} ${y + halfH} Z`}
        fill={C.bg}
        stroke={C.stroke}
        strokeWidth="1"
      />
    </g>
  );
}

/** Middle layer — isometric hub with square dashed pads + white platform logos. */
export function HeroMiddleIllustration({
  width = 540,
  height = 380,
  className,
}: Props) {
  const pads: Pad[] = [
    { x: 270, y: 52, logo: "x" },
    { x: 155, y: 100, logo: "ig" },
    { x: 385, y: 100, logo: "li" },
    { x: 140, y: 165, logo: "bluesky" },
    { x: 400, y: 165, logo: "threads" },
    { x: 270, y: 195, logo: "yt" },
    { x: 120, y: 220, logo: "tt", pedestal: true },
    { x: 420, y: 220, logo: "fb", pedestal: true },
    { x: 270, y: 265, logo: "pin" },
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

      {pads.map((p) => {
        const s = 36;
        const halfW = s * 0.866;
        const halfH = s * 0.5;
        return (
          <g key={p.logo}>
            {p.pedestal ? <Pedestal x={p.x} y={p.y} /> : null}
            {!p.pedestal ? (
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
            ) : (
              /* Logo sits on pedestal top — dashed rim */
              <path
                d={`M${p.x} ${p.y - halfH}
                   L${p.x + halfW} ${p.y}
                   L${p.x} ${p.y + halfH}
                   L${p.x - halfW} ${p.y} Z`}
                fill="none"
                stroke={C.ink}
                strokeDasharray="2.5 2.5"
                strokeWidth="1.15"
              />
            )}
            <g transform={`translate(${p.x - 7} ${p.y - 8})`}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path d={LOGO_PATHS[p.logo]} fill={C.ink} />
              </svg>
            </g>
          </g>
        );
      })}

      {/* Hub pulse */}
      <ellipse
        cx="270"
        cy="155"
        rx="30"
        ry="17"
        fill="none"
        stroke={C.accent}
        strokeWidth="1.25"
        opacity="0.45"
      />
      <ellipse
        cx="270"
        cy="155"
        rx="18"
        ry="10"
        fill="none"
        stroke={C.accent}
        strokeWidth="1.5"
        opacity="0.75"
      />
      <ellipse
        cx="270"
        cy="155"
        rx="8"
        ry="4.5"
        fill={C.accentHot}
        opacity="0.95"
      />

      {[
        [270, 140, 270, 72],
        [250, 148, 175, 110],
        [290, 148, 365, 110],
        [250, 155, 160, 165],
        [290, 155, 380, 165],
        [270, 170, 270, 185],
        [245, 175, 140, 210],
        [295, 175, 400, 210],
        [270, 175, 270, 250],
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
          opacity="0.4"
        />
      ))}
    </svg>
  );
}
