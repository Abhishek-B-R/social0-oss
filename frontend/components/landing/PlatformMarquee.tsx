"use client";

import {
  SiLinkedin,
  SiInstagram,
  SiYoutube,
  SiPinterest,
  SiTiktok,
  SiX,
  SiThreads,
  SiBluesky,
  SiFacebook,
} from "react-icons/si";

// Same order as lib/platforms.ts: blues → reds → gradient → blacks
const PLATFORMS = [
  { name: "LinkedIn", icon: SiLinkedin, color: "bg-[#0A66C2]", textColor: "text-white" },
  { name: "Facebook", icon: SiFacebook, color: "bg-[#1877F2]", textColor: "text-white" },
  { name: "Bluesky", icon: SiBluesky, color: "bg-[#0085FF]", textColor: "text-white" },
  { name: "YouTube", icon: SiYoutube, color: "bg-[#FF0000]", textColor: "text-white" },
  { name: "Pinterest", icon: SiPinterest, color: "bg-[#E60023]", textColor: "text-white" },
  {
    name: "Instagram",
    icon: SiInstagram,
    color: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
    textColor: "text-white",
  },
  { name: "TikTok", icon: SiTiktok, color: "bg-[#000000]", textColor: "text-white" },
  { name: "X", icon: SiX, color: "bg-[#000000]", textColor: "text-white" },
  { name: "Threads", icon: SiThreads, color: "bg-[#000000]", textColor: "text-white" },
];

function PlatformPill({
  name,
  icon: Icon,
  color,
  textColor,
}: {
  name: string;
  icon: typeof SiLinkedin;
  color: string;
  textColor: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 shrink-0 rounded-full pl-1.5 pr-4 py-1.5 ${color} ${textColor} font-semibold text-sm shadow-sm hover:scale-105 transition-transform cursor-pointer`}
      style={{ filter: "drop-shadow(0 2px 4px rgba(255,255,255,0.2))" }}
    >
      <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </span>
      {name}
    </div>
  );
}

export function PlatformMarquee() {
  const duplicated = [...PLATFORMS, ...PLATFORMS];

  return (
    <div className="w-full overflow-hidden py-2">
      <div
        className="flex gap-4"
        style={{
          width: "max-content",
          animation: "marquee 30s linear infinite",
        }}
      >
        {duplicated.map((p, i) => (
          <PlatformPill
            key={`${p.name}-${i}`}
            name={p.name}
            icon={p.icon}
            color={p.color}
            textColor={p.textColor}
          />
        ))}
      </div>
    </div>
  );
}
