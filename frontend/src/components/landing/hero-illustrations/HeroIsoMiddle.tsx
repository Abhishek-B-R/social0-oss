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
  size?: number;
};

/** Middle layer — isometric hub with all 9 platform logos. */
export function HeroMiddleIllustration({
  width = 540,
  height = 380,
  className,
}: Props) {
  // Hub center glow at (270, 155). TT bottom-left, FB bottom-right;
  // Threads opposite TT (right), Bluesky opposite FB (left),
  // Pinterest between TT and FB at bottom-center.
  const pads: Pad[] = [
    { x: 270, y: 52, logo: "x" },
    { x: 155, y: 100, logo: "ig" },
    { x: 385, y: 100, logo: "li", accent: true },
    { x: 140, y: 165, logo: "bluesky" }, // opposite Facebook
    { x: 400, y: 165, logo: "threads" }, // opposite TikTok
    { x: 270, y: 195, logo: "yt" },
    { x: 120, y: 220, logo: "tt" },
    { x: 420, y: 220, logo: "fb" },
    { x: 270, y: 265, logo: "pin" }, // between TT and FB
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
      <rect
        width="280"
        height="260"
        rx="3"
        transform={ISO.top(260, 18)}
        fill={C.surface}
        stroke={C.stroke}
      />
      <rect
        width="280"
        height="36"
        rx="2"
        transform={ISO.right(260 + 280 * 0.86603, 18 + 280 * 0.5)}
        fill={C.panel}
        stroke={C.ink}
      />
      <path
        d="M2 140c0-1.1.78-1.55 1.73-1L246 280c.96.55 1.73 1.89 1.73 3v42c0 1.1-.78 1.55-1.73 1L3.73 185c-.96-.55-1.73-1.89-1.73-3z"
        fill={C.panel}
        stroke={C.strokeSoft}
        transform="translate(18 12)"
      />

      {pads.map((p) => {
        const s = p.size ?? 34;
        const halfW = s * 0.866;
        const halfH = s * 0.5;
        return (
          <g key={p.logo}>
            <path
              d={`M${p.x} ${p.y - halfH}
                 L${p.x + halfW} ${p.y}
                 L${p.x} ${p.y + halfH}
                 L${p.x - halfW} ${p.y} Z`}
              fill={p.accent ? C.accent : C.mid}
              stroke={p.accent ? C.accentHot : C.ink}
              strokeDasharray={p.accent ? undefined : "2 2"}
              strokeWidth={p.accent ? 1.5 : 1}
              opacity={0.95}
            />
            {p.accent && (
              <>
                <path
                  d={`M${p.x + halfW} ${p.y} L${p.x + halfW} ${p.y + 8} L${p.x} ${p.y + halfH + 8} L${p.x} ${p.y + halfH} Z`}
                  fill={C.accentDim}
                  stroke={C.accent}
                />
                <path
                  d={`M${p.x - halfW} ${p.y} L${p.x - halfW} ${p.y + 8} L${p.x} ${p.y + halfH + 8} L${p.x} ${p.y + halfH} Z`}
                  fill={C.accentDeep}
                  stroke={C.accent}
                />
              </>
            )}
            <g transform={`translate(${p.x - 7} ${p.y - 7})`}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path
                  d={LOGO_PATHS[p.logo]}
                  fill={p.accent ? C.inkInverse : C.ink}
                />
              </svg>
            </g>
          </g>
        );
      })}

      <ellipse
        cx="270"
        cy="155"
        rx="26"
        ry="15"
        fill="none"
        stroke={C.accent}
        strokeWidth="1.5"
        opacity="0.7"
      />
      <ellipse
        cx="270"
        cy="155"
        rx="11"
        ry="6.5"
        fill={C.accent}
        opacity="0.85"
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
          opacity="0.35"
        />
      ))}
    </svg>
  );
}
