import { C, ISO } from "./iso-tokens";

interface Props {
  width?: number;
  height?: number;
  className?: string;
}

/** Top layer — Social0 MCP Agent chat (agent mode). Matches hand-authored iso design. */
export function HeroTopAgentIllustration({
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
        <linearGradient id="s0-agent-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.45" />
          <stop offset="100%" stopColor={C.accentHot} stopOpacity="0" />
        </linearGradient>
        <filter id="s0-agent-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>

      <ellipse
        cx="360"
        cy="300"
        rx="220"
        ry="50"
        fill="url(#s0-agent-glow)"
        filter="url(#s0-agent-soft)"
        opacity="0.7"
      />

      {/* Shift so agent window centers on the stack axis (middle hub) */}
      <g transform="translate(55 0)">
        {/* Main MCP Agent window */}
        <g transform={ISO.top(270, 58)}>
          <rect
            width="250"
            height="168"
            rx="10"
            fill={C.panel}
            stroke={C.stroke}
            strokeWidth="1.25"
          />
          {/* Title bar */}
          <rect width="250" height="22" rx="10" fill={C.muted} />
          <rect y="14" width="250" height="8" fill={C.muted} />
          <circle cx="12" cy="11" r="3" fill="#ff5f57" />
          <circle cx="24" cy="11" r="3" fill="#febc2e" />
          <circle cx="36" cy="11" r="3" fill="#28c840" />
          <text
            x="125"
            y="14"
            textAnchor="middle"
            fill={C.strokeBright}
            fontSize="7.5"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="600"
            opacity="0.85"
          >
            Social0 - MCP Agent
          </text>

          {/* User row */}
          <circle cx="28" cy="48" r="11" fill="#f0a070" />
          <text
            x="28"
            y="51"
            textAnchor="middle"
            fill="#1a120c"
            fontSize="6"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="700"
          >
            ME
          </text>
          <rect
            x="46"
            y="36"
            width="178"
            height="28"
            rx="8"
            fill={C.elevated}
            stroke={C.strokeSoft}
          />
          <text
            x="54"
            y="48"
            fill={C.ink}
            fontSize="6.5"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Post this to X, LinkedIn &amp; Threads
          </text>
          <text
            x="54"
            y="58"
            fill={C.strokeBright}
            fontSize="6"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            opacity="0.7"
          >
            Thursday · 10:00 AM
          </text>

          {/* Bot / tool call box */}
          <rect
            x="20"
            y="74"
            width="210"
            height="48"
            rx="8"
            fill={C.bg}
            stroke={C.accent}
            strokeWidth="1.35"
          />
          <text
            x="30"
            y="90"
            fill={C.accentHot}
            fontSize="6.5"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontWeight="600"
          >
            agent: social0_posts create
          </text>
          <text
            x="30"
            y="102"
            fill={C.strokeBright}
            fontSize="6"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            opacity="0.85"
          >
            --platforms: X, LinkedIn, Threads
          </text>
          <rect
            x="30"
            y="110"
            width="120"
            height="3"
            rx="1.5"
            fill={C.accent}
            opacity="0.35"
          />

          {/* Success line */}
          <text
            x="28"
            y="146"
            fill={C.accentHot}
            fontSize="7.5"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="600"
          >
            Scheduled on 3 platforms ←
          </text>
        </g>

        {/* Floating CLI / MCP — left of brand mark, stacked on one vertical axis */}
        <g transform={ISO.top(470, 72)}>
          <rect
            width="58"
            height="42"
            rx="5"
            fill={C.elevated}
            stroke={C.stroke}
            strokeWidth="1.2"
          />
          <text
            x="10"
            y="18"
            fill={C.ink}
            fontSize="8"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="700"
          >
            CLI
          </text>
          <rect
            x="10"
            y="24"
            width="40"
            height="3.5"
            rx="1.5"
            fill={C.accent}
            opacity="0.9"
          />
          <rect
            x="10"
            y="32"
            width="28"
            height="2.5"
            rx="1"
            fill={C.strokeSoft}
          />
        </g>

        <g transform={ISO.top(470, 128)}>
          <rect
            width="58"
            height="42"
            rx="5"
            fill={C.elevated}
            stroke={C.accent}
            strokeWidth="1.35"
          />
          <text
            x="10"
            y="18"
            fill={C.ink}
            fontSize="8"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="700"
          >
            MCP
          </text>
          <rect
            x="10"
            y="24"
            width="40"
            height="3.5"
            rx="1.5"
            fill={C.accentHot}
          />
          <rect
            x="10"
            y="32"
            width="28"
            height="2.5"
            rx="1"
            fill={C.strokeSoft}
          />
        </g>
      </g>
    </svg>
  );
}
