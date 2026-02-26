"use client";

import {
  SiLinkedin,
  SiInstagram,
  SiYoutube,
  SiPinterest,
  SiX,
} from "react-icons/si";

const PLATFORMS = [
  { name: "LinkedIn", icon: SiLinkedin, color: "bg-[#0A66C2]", connected: true },
  {
    name: "Instagram",
    icon: SiInstagram,
    color: "bg-gradient-to-br from-[#F58529] to-[#8134AF]",
    connected: true,
  },
  { name: "YouTube", icon: SiYoutube, color: "bg-[#FF0000]", connected: true },
  { name: "Pinterest", icon: SiPinterest, color: "bg-[#E60023]", connected: false },
  { name: "X (Twitter)", icon: SiX, color: "bg-gray-900", connected: false },
];

export function PlatformToggleMockup() {
  return (
    <div className="rounded-xl border border-border bg-bg shadow-lg p-4 max-w-sm mx-auto">
      <div className="text-xs font-medium text-text-muted mb-3">
        Connected accounts
      </div>
      <div className="space-y-2">
        {PLATFORMS.map((p) => (
          <div
            key={p.name}
            className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg-subtle"
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-lg ${p.color} flex items-center justify-center text-white`}
              >
                <p.icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium text-text">
                {p.name}
              </span>
            </div>
            <div
              className={`w-9 h-5 rounded-full transition-colors ${
                p.connected ? "bg-accent" : "bg-bg-muted"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-bg shadow mt-0.5 ${
                  p.connected ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
