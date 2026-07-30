/**
 * Product-faithful wireframe UIs for landing sections.
 * Drawn to match real Social0 surfaces: Composer, Connections,
 * Calendar, Schedule sidebar — not abstract decoration planes.
 */
import { C, LOGO_PATHS } from "../hero-illustrations/iso-tokens";

function LogoMark({
  logo,
  x,
  y,
  size = 10,
  fill = C.ink,
}: {
  logo: keyof typeof LOGO_PATHS;
  x: number;
  y: number;
  size?: number;
  fill?: string;
}) {
  const s = size / 24;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={LOGO_PATHS[logo]} fill={fill} />
    </g>
  );
}

function WinChrome({
  w,
  title,
}: {
  w: number;
  title: string;
}) {
  return (
    <>
      <rect width={w} height="22" rx="8" fill={C.muted} />
      <circle cx="12" cy="11" r="3" fill="#ff5f57" />
      <circle cx="24" cy="11" r="3" fill="#febc2e" />
      <circle cx="36" cy="11" r="3" fill="#28c840" />
      <text
        x={w / 2}
        y="15"
        textAnchor="middle"
        fill={C.strokeBright}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="500"
      >
        {title}
      </text>
    </>
  );
}

/** Quick Composer — exact product moment: textarea + chips + Continue */
export function WfComposer({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 200"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="280"
        height="200"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={280} title="Composer" />
      <rect
        x="14"
        y="34"
        width="252"
        height="110"
        rx="12"
        fill={C.panel}
        stroke={C.strokeSoft}
      />
      <text
        x="28"
        y="56"
        fill={C.strokeBright}
        fontSize="10"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        opacity="0.55"
      >
        Share what's on your mind…
      </text>
      <rect x="28" y="68" width="140" height="5" rx="2" fill={C.strokeSoft} />
      <rect x="28" y="80" width="190" height="5" rx="2" fill={C.strokeSoft} />
      <rect x="28" y="92" width="110" height="5" rx="2" fill={C.strokeSoft} />
      {/* media thumbs */}
      <rect
        x="28"
        y="110"
        width="36"
        height="24"
        rx="4"
        fill={C.elevated}
        stroke={C.accent}
      />
      <rect
        x="70"
        y="110"
        width="36"
        height="24"
        rx="4"
        fill={C.elevated}
        stroke={C.strokeSoft}
      />
      <circle cx="58" cy="116" r="6" fill={C.accent} />
      <text
        x="56"
        y="119"
        fill={C.inkInverse}
        fontSize="7"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
      >
        1
      </text>
      {/* chips */}
      <rect
        x="14"
        y="154"
        width="72"
        height="18"
        rx="9"
        fill={C.elevated}
        stroke={C.strokeSoft}
      />
      <text
        x="50"
        y="166"
        textAnchor="middle"
        fill={C.strokeBright}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        Images
      </text>
      <rect
        x="92"
        y="154"
        width="88"
        height="18"
        rx="9"
        fill={C.accent}
        opacity="0.2"
        stroke={C.accent}
      />
      <text
        x="136"
        y="166"
        textAnchor="middle"
        fill={C.accentHot}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="600"
      >
        + Thread
      </text>
      <rect x="190" y="152" width="76" height="22" rx="11" fill={C.accent} />
      <text
        x="228"
        y="166"
        textAnchor="middle"
        fill={C.inkInverse}
        fontSize="9"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
      >
        Continue
      </text>
    </svg>
  );
}

/** Connections list — platform rows + Connect */
export function WfConnections({ className = "" }: { className?: string }) {
  const rows: {
    logo: keyof typeof LOGO_PATHS;
    name: string;
    connected?: boolean;
  }[] = [
    { logo: "x", name: "X", connected: true },
    { logo: "ig", name: "Instagram", connected: true },
    { logo: "li", name: "LinkedIn" },
    { logo: "threads", name: "Threads" },
    { logo: "bluesky", name: "Bluesky", connected: true },
    { logo: "pin", name: "Pinterest" },
  ];
  return (
    <svg
      viewBox="0 0 260 220"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="260"
        height="220"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={260} title="Connected Accounts" />
      <text
        x="16"
        y="40"
        fill={C.strokeBright}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        opacity="0.5"
      >
        3/9 accounts connected
      </text>
      {rows.map((r, i) => {
        const y = 52 + i * 26;
        return (
          <g key={r.name}>
            <rect
              x="12"
              y={y}
              width="236"
              height="22"
              rx="8"
              fill={C.panel}
              stroke={C.strokeSoft}
            />
            <circle
              cx="28"
              cy={y + 11}
              r="8"
              fill={C.elevated}
              stroke={C.accent}
              strokeWidth="1.2"
            />
            <LogoMark logo={r.logo} x={23} y={y + 6} size={10} fill={C.accent} />
            <text
              x="44"
              y={y + 15}
              fill={C.ink}
              fontSize="9"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="500"
            >
              {r.name}
            </text>
            {r.connected ? (
              <>
                <circle cx="168" cy={y + 11} r="6" fill={C.muted} />
                <text
                  x="200"
                  y={y + 15}
                  textAnchor="middle"
                  fill={C.accentHot}
                  fontSize="8"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fontWeight="600"
                >
                  Connected
                </text>
              </>
            ) : (
              <rect
                x="178"
                y={y + 4}
                width="58"
                height="14"
                rx="7"
                fill={C.accent}
              />
            )}
            {!r.connected && (
              <text
                x="207"
                y={y + 14}
                textAnchor="middle"
                fill={C.inkInverse}
                fontSize="8"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontWeight="700"
              >
                Connect
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Calendar month view with status dots */
export function WfCalendar({ className = "" }: { className?: string }) {
  const cells = Array.from({ length: 28 }, (_, i) => i);
  const marked = new Set([3, 8, 9, 14, 18, 22, 25]);
  const today = 15;
  return (
    <svg
      viewBox="0 0 260 200"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="260"
        height="200"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={260} title="Calendar" />
      <text
        x="16"
        y="42"
        fill={C.ink}
        fontSize="11"
        fontFamily="Georgia, serif"
        fontStyle="italic"
      >
        July 2026
      </text>
      {/* segment */}
      {["Month", "Week", "Day"].map((t, i) => (
        <g key={t}>
          <rect
            x={150 + i * 34}
            y="30"
            width="32"
            height="16"
            rx="6"
            fill={i === 0 ? C.accentDim : C.elevated}
            stroke={i === 0 ? C.accent : C.strokeSoft}
          />
          <text
            x={166 + i * 34}
            y="41"
            textAnchor="middle"
            fill={i === 0 ? C.accentHot : C.strokeBright}
            fontSize="7"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="600"
          >
            {t}
          </text>
        </g>
      ))}
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <text
          key={`${d}-${i}`}
          x={28 + i * 32}
          y="62"
          textAnchor="middle"
          fill={C.strokeBright}
          fontSize="7"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          opacity="0.5"
        >
          {d}
        </text>
      ))}
      {cells.map((i) => {
        const col = i % 7;
        const row = Math.floor(i / 7);
        const x = 14 + col * 32;
        const y = 70 + row * 28;
        const isToday = i === today;
        const has = marked.has(i);
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width="28"
              height="24"
              rx="5"
              fill={isToday ? C.accentDim : C.panel}
              stroke={isToday ? C.accent : C.strokeSoft}
            />
            <text
              x={x + 8}
              y={y + 11}
              fill={C.ink}
              fontSize="7"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              {i + 1}
            </text>
            {has && (
              <circle
                cx={x + 14}
                cy={y + 17}
                r="2.5"
                fill={i % 3 === 0 ? "#3b82f6" : C.accent}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Create form: accounts + caption + schedule sidebar */
export function WfScheduleCreate({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 200"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="300"
        height="200"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={300} title="Create post" />
      {/* left main */}
      <rect
        x="12"
        y="32"
        width="168"
        height="156"
        rx="10"
        fill={C.panel}
        stroke={C.strokeSoft}
      />
      <text
        x="22"
        y="50"
        fill={C.strokeBright}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        opacity="0.55"
      >
        Accounts
      </text>
      {(["x", "ig", "li", "yt"] as const).map((logo, i) => (
        <g key={logo}>
          <circle
            cx={30 + i * 28}
            cy={66}
            r="10"
            fill={C.elevated}
            stroke={i < 3 ? C.accent : C.strokeSoft}
            strokeWidth="1.5"
          />
          <LogoMark
            logo={logo}
            x={25 + i * 28}
            y={61}
            size={10}
            fill={i < 3 ? C.accent : C.strokeBright}
          />
        </g>
      ))}
      <text
        x="22"
        y="96"
        fill={C.strokeBright}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        opacity="0.55"
      >
        What do you want to post?
      </text>
      <rect
        x="20"
        y="104"
        width="148"
        height="48"
        rx="8"
        fill={C.elevated}
        stroke={C.strokeSoft}
      />
      <rect x="28" y="116" width="100" height="4" rx="1" fill={C.strokeSoft} />
      <rect x="28" y="126" width="120" height="4" rx="1" fill={C.strokeSoft} />
      <rect
        x="20"
        y="162"
        width="72"
        height="16"
        rx="8"
        fill={C.accent}
        opacity="0.18"
        stroke={C.accent}
      />
      <text
        x="56"
        y="173"
        textAnchor="middle"
        fill={C.accentHot}
        fontSize="7"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="600"
      >
        Captions
      </text>
      {/* schedule sidebar */}
      <rect
        x="188"
        y="32"
        width="100"
        height="156"
        rx="10"
        fill={C.elevated}
        stroke={C.stroke}
      />
      <text
        x="198"
        y="50"
        fill={C.ink}
        fontSize="9"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="600"
      >
        Schedule
      </text>
      <rect
        x="198"
        y="58"
        width="28"
        height="14"
        rx="7"
        fill={C.accent}
      />
      <circle cx="218" cy="65" r="5" fill={C.inkInverse} />
      <rect
        x="198"
        y="84"
        width="80"
        height="22"
        rx="6"
        fill={C.panel}
        stroke={C.strokeSoft}
      />
      <text
        x="238"
        y="98"
        textAnchor="middle"
        fill={C.strokeBright}
        fontSize="7"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        Fri · 9:00 AM
      </text>
      <rect x="198" y="116" width="80" height="22" rx="8" fill={C.accent} />
      <text
        x="238"
        y="130"
        textAnchor="middle"
        fill={C.inkInverse}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
      >
        Schedule
      </text>
      <rect
        x="198"
        y="146"
        width="80"
        height="20"
        rx="8"
        fill="none"
        stroke={C.strokeSoft}
      />
      <text
        x="238"
        y="159"
        textAnchor="middle"
        fill={C.strokeBright}
        fontSize="7"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        Save draft
      </text>
    </svg>
  );
}

/** Per-platform captions panel */
export function WfCaptions({ className = "" }: { className?: string }) {
  const platforms = [
    { logo: "x" as const, label: "X", active: false },
    { logo: "li" as const, label: "LinkedIn", active: true },
    { logo: "ig" as const, label: "IG", active: false },
  ];
  return (
    <svg
      viewBox="0 0 260 180"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="260"
        height="180"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={260} title="Platform Captions" />
      {platforms.map((p, i) => {
        const y = 34 + i * 46;
        return (
          <g key={p.label}>
            <rect
              x="12"
              y={y}
              width="236"
              height="40"
              rx="10"
              fill={p.active ? C.accentDim : C.panel}
              stroke={p.active ? C.accent : C.strokeSoft}
              strokeWidth={p.active ? 1.5 : 1}
            />
            <circle
              cx="32"
              cy={y + 20}
              r="10"
              fill={C.elevated}
              stroke={C.accent}
            />
            <LogoMark logo={p.logo} x={27} y={y + 15} size={10} fill={C.accent} />
            <text
              x="50"
              y={y + 14}
              fill={C.ink}
              fontSize="9"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="600"
            >
              {p.label}
            </text>
            <rect
              x="50"
              y={y + 20}
              width={p.active ? 140 : 100}
              height="4"
              rx="1"
              fill={p.active ? C.accent : C.strokeSoft}
              opacity={p.active ? 0.7 : 1}
            />
            <rect
              x="50"
              y={y + 28}
              width={p.active ? 90 : 70}
              height="3"
              rx="1"
              fill={C.strokeSoft}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Parallel publish status overlay */
export function WfPublishStatus({ className = "" }: { className?: string }) {
  const rows: { logo: keyof typeof LOGO_PATHS; ok: boolean | "warn" }[] = [
    { logo: "x", ok: true },
    { logo: "ig", ok: true },
    { logo: "li", ok: true },
    { logo: "yt", ok: "warn" },
    { logo: "tt", ok: true },
    { logo: "threads", ok: true },
  ];
  return (
    <svg
      viewBox="0 0 240 180"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="240"
        height="180"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={240} title="Publishing…" />
      <text
        x="120"
        y="48"
        textAnchor="middle"
        fill={C.ink}
        fontSize="10"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="600"
      >
        Publishing to all platforms…
      </text>
      {rows.map((r, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 28 + col * 70;
        const y = 68 + row * 48;
        return (
          <g key={r.logo}>
            <circle
              cx={x + 20}
              cy={y + 14}
              r="14"
              fill={C.elevated}
              stroke={C.strokeSoft}
            />
            <LogoMark logo={r.logo} x={x + 14} y={y + 8} size={12} fill={C.accent} />
            <circle
              cx={x + 32}
              cy={y + 4}
              r="6"
              fill={r.ok === true ? C.accent : "#f59e0b"}
            />
            <path
              d={
                r.ok === true
                  ? `M${x + 29} ${y + 4} l2 2 l4 -4`
                  : `M${x + 32} ${y + 1} v4 M${x + 32} ${y + 7} v0.5`
              }
              stroke={C.inkInverse}
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Thread composer — Post 1 / Post 2 / Post 3 */
export function WfThreads({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 180"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="240"
        height="180"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={240} title="Threads" />
      {[0, 1, 2].map((i) => {
        const y = 34 + i * 44;
        return (
          <g key={i}>
            {i > 0 && (
              <line
                x1="28"
                y1={y - 6}
                x2="28"
                y2={y + 4}
                stroke={C.accent}
                strokeWidth="1.5"
              />
            )}
            <rect
              x="14"
              y={y}
              width="212"
              height="36"
              rx="10"
              fill={C.panel}
              stroke={i === 0 ? C.accent : C.strokeSoft}
            />
            <text
              x="26"
              y={y + 14}
              fill={C.accentHot}
              fontSize="8"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="700"
            >
              Post {i + 1}
            </text>
            <rect
              x="26"
              y={y + 20}
              width={140 - i * 20}
              height="4"
              rx="1"
              fill={C.strokeSoft}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Auto-plug / growth toggles */
export function WfAutopilot({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 180"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="240"
        height="180"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={240} title="Growth" />
      {/* sparkline */}
      <path
        d="M24 100 C50 95, 70 70, 100 78 S150 50, 180 42 S210 55, 220 48"
        fill="none"
        stroke={C.accent}
        strokeWidth="2"
      />
      <path
        d="M24 100 C50 95, 70 70, 100 78 S150 50, 180 42 S210 55, 220 48 L220 130 L24 130 Z"
        fill={C.accent}
        opacity="0.12"
      />
      <circle cx="180" cy="42" r="5" fill={C.accentHot} stroke={C.bg} strokeWidth="2" />
      <text
        x="188"
        y="36"
        fill={C.accentHot}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
      >
        plug
      </text>
      {[
        { label: "Auto-Repost", on: true },
        { label: "Auto-Plug", on: true },
      ].map((t, i) => (
        <g key={t.label}>
          <rect
            x="16"
            y={140 + i * 0}
            width={i === 0 ? 100 : 0}
            height="0"
          />
          <rect
            x={16 + i * 110}
            y="142"
            width="100"
            height="24"
            rx="8"
            fill={C.panel}
            stroke={C.strokeSoft}
          />
          <text
            x={28 + i * 110}
            y="157"
            fill={C.ink}
            fontSize="8"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="500"
          >
            {t.label}
          </text>
          <rect
            x={88 + i * 110}
            y="148"
            width="22"
            height="12"
            rx="6"
            fill={C.accent}
          />
          <circle cx={104 + i * 110} cy="154" r="4" fill={C.inkInverse} />
        </g>
      ))}
    </svg>
  );
}

/** Bulk media queue */
export function WfBulk({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 160"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="240"
        height="160"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={240} title="Bulk tools" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect
            x={16 + i * 42}
            y="48"
            width="36"
            height="48"
            rx="6"
            fill={i % 2 === 0 ? C.accent : C.panel}
            stroke={C.stroke}
            opacity={i % 2 === 0 ? 0.85 : 1}
          />
          <rect
            x={20 + i * 42}
            y="104"
            width="28"
            height="6"
            rx="2"
            fill={C.strokeSoft}
          />
          <text
            x={34 + i * 42}
            y="126"
            textAnchor="middle"
            fill={C.strokeBright}
            fontSize="7"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Day {i + 1}
          </text>
        </g>
      ))}
      <rect x="16" y="136" width="208" height="14" rx="7" fill={C.elevated} />
      <rect x="16" y="136" width="140" height="14" rx="7" fill={C.accent} opacity="0.7" />
    </svg>
  );
}

/** API / MCP / CLI terminal */
export function WfApiCli({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 150"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="260"
        height="150"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={260} title="Terminal" />
      <rect
        x="12"
        y="32"
        width="236"
        height="104"
        rx="10"
        fill={C.elevated}
        stroke={C.strokeSoft}
      />
      <text
        x="24"
        y="56"
        fill={C.accentHot}
        fontSize="11"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        $ social0 post --schedule
      </text>
      <text
        x="24"
        y="76"
        fill={C.strokeBright}
        fontSize="10"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        opacity="0.7"
      >
        → platforms: x, linkedin, threads
      </text>
      <text
        x="24"
        y="96"
        fill={C.strokeBright}
        fontSize="10"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        opacity="0.7"
      >
        → mcp · rest · cli
      </text>
      <text
        x="24"
        y="116"
        fill={C.accent}
        fontSize="10"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        ✓ queued for Fri 9:00 AM
      </text>
    </svg>
  );
}

/** Secure tokens / lock on connection */
export function WfSecure({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 150"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="220"
        height="150"
        rx="16"
        fill={C.bg}
        stroke={C.stroke}
      />
      <WinChrome w={220} title="OAuth" />
      <rect
        x="50"
        y="48"
        width="120"
        height="80"
        rx="12"
        fill={C.panel}
        stroke={C.accent}
        strokeWidth="1.5"
      />
      <path
        d="M90 70 v-10 a20 14 0 0 1 40 0 v10"
        fill="none"
        stroke={C.accentHot}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="110" cy="96" r="10" fill={C.accent} />
      <rect x="107" y="92" width="6" height="10" rx="2" fill={C.inkInverse} />
      <text
        x="110"
        y="122"
        textAnchor="middle"
        fill={C.strokeBright}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        Tokens encrypted at rest
      </text>
    </svg>
  );
}

/** Indie builder: terminal shipping to socials */
export function WfBuilder({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 140"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        width="140"
        height="120"
        rx="12"
        x="8"
        y="10"
        fill={C.elevated}
        stroke={C.stroke}
      />
      <circle cx="22" cy="26" r="3" fill="#ff5f57" />
      <circle cx="34" cy="26" r="3" fill="#febc2e" />
      <circle cx="46" cy="26" r="3" fill="#28c840" />
      <text
        x="20"
        y="48"
        fill={C.accentHot}
        fontSize="9"
        fontFamily="ui-monospace, Menlo, monospace"
      >
        $ ship --public
      </text>
      <rect x="20" y="58" width="90" height="4" rx="1" fill={C.strokeSoft} />
      <rect x="20" y="68" width="70" height="4" rx="1" fill={C.strokeSoft} />
      <rect x="20" y="88" width="56" height="18" rx="6" fill={C.accent} />
      <text
        x="48"
        y="100"
        textAnchor="middle"
        fill={C.inkInverse}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
      >
        Post
      </text>
      {(["x", "bluesky", "threads"] as const).map((logo, i) => {
        const y = 28 + i * 36;
        return (
          <g key={logo}>
            <path
              d={`M148 70 C170 ${70 + (y - 70) * 0.3}, 190 ${y}, 208 ${y}`}
              fill="none"
              stroke={C.accent}
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
            <circle
              cx="224"
              cy={y}
              r="14"
              fill={C.bg}
              stroke={C.accent}
              strokeWidth="1.5"
            />
            <LogoMark logo={logo} x={218} y={y - 6} size={12} fill={C.accent} />
          </g>
        );
      })}
    </svg>
  );
}

/** Creator: media frame fanning to IG/YT/TT */
export function WfCreator({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 140"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        x="16"
        y="20"
        width="100"
        height="100"
        rx="12"
        fill={C.panel}
        stroke={C.stroke}
      />
      <rect
        x="28"
        y="36"
        width="76"
        height="52"
        rx="6"
        fill={C.elevated}
        stroke={C.strokeSoft}
      />
      <polygon
        points="58,48 78,62 58,76"
        fill={C.accent}
        opacity="0.9"
      />
      <rect x="28" y="96" width="48" height="6" rx="2" fill={C.strokeSoft} />
      <rect x="28" y="108" width="64" height="4" rx="1" fill={C.strokeSoft} />
      {(["ig", "yt", "tt"] as const).map((logo, i) => {
        const y = 30 + i * 36;
        return (
          <g key={logo}>
            <line
              x1="116"
              y1="70"
              x2="168"
              y2={y + 14}
              stroke={C.accent}
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
            <rect
              x="170"
              y={y}
              width="72"
              height="28"
              rx="8"
              fill={C.bg}
              stroke={C.strokeSoft}
            />
            <circle
              cx="186"
              cy={y + 14}
              r="9"
              fill={C.elevated}
              stroke={C.accent}
            />
            <LogoMark logo={logo} x={181} y={y + 9} size={10} fill={C.accent} />
            <rect
              x="200"
              y={y + 10}
              width="32"
              height="4"
              rx="1"
              fill={C.strokeSoft}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Marketer: schedule sidebar + growth bars */
export function WfMarketer({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 140"
      className={className || "h-full w-full"}
      aria-hidden
    >
      <rect
        x="12"
        y="16"
        width="120"
        height="108"
        rx="12"
        fill={C.panel}
        stroke={C.stroke}
      />
      <text
        x="24"
        y="38"
        fill={C.ink}
        fontSize="9"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="600"
      >
        Schedule post
      </text>
      <rect x="24" y="48" width="32" height="14" rx="7" fill={C.accent} />
      <circle cx="46" cy="55" r="5" fill={C.inkInverse} />
      <rect
        x="24"
        y="74"
        width="96"
        height="18"
        rx="6"
        fill={C.elevated}
        stroke={C.strokeSoft}
      />
      <text
        x="72"
        y="86"
        textAnchor="middle"
        fill={C.strokeBright}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        Mon–Fri · 9am
      </text>
      <rect x="24" y="100" width="96" height="16" rx="8" fill={C.accent} />
      <text
        x="72"
        y="111"
        textAnchor="middle"
        fill={C.inkInverse}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
      >
        Queue
      </text>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={152 + i * 18}
          y={108 - (i + 1) * 14}
          width="12"
          height={(i + 1) * 14}
          rx="2"
          fill={i === 4 ? C.accentHot : C.muted}
          stroke={C.strokeSoft}
        />
      ))}
      <text
        x="196"
        y="128"
        textAnchor="middle"
        fill={C.strokeBright}
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        opacity="0.6"
      >
        Reach
      </text>
    </svg>
  );
}
