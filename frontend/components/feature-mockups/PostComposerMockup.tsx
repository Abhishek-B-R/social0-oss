"use client";

import {
  SiLinkedin,
  SiInstagram,
  SiYoutube,
  SiPinterest,
  SiX,
} from "react-icons/si";

const PLATFORM_ICONS = [
  { name: "LinkedIn", icon: SiLinkedin, color: "bg-[#0A66C2]" },
  {
    name: "Instagram",
    icon: SiInstagram,
    color: "bg-gradient-to-br from-[#F58529] to-[#8134AF]",
  },
  { name: "YouTube", icon: SiYoutube, color: "bg-[#FF0000]" },
  { name: "Pinterest", icon: SiPinterest, color: "bg-[#E60023]" },
  { name: "X", icon: SiX, color: "bg-gray-900" },
];

export function PostComposerMockup() {
  return (
    <div className="rounded-xl border border-border bg-bg shadow-xl p-5 max-w-md mx-auto">
      <div className="flex gap-2 mb-4">
        <span className="px-3 py-1.5 rounded-md bg-bg-muted text-text-muted text-xs font-semibold">
          Text
        </span>
        <span className="px-3 py-1.5 rounded-md bg-accent/15 text-accent text-xs font-semibold border border-accent/30">
          Image
        </span>
        <span className="px-3 py-1.5 rounded-md bg-bg-muted text-text-muted text-xs font-semibold">
          Video
        </span>
        <span className="px-3 py-1.5 rounded-md bg-bg-muted text-text-muted text-xs font-semibold">
          Thread
        </span>
        <span className="px-3 py-1.5 rounded-md bg-bg-muted text-text-muted text-xs font-semibold">
          Collection
        </span>
      </div>
      <div className="h-24 rounded-lg border-2 border-dashed border-border bg-bg-subtle/50 flex items-center justify-center mb-4 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-text-muted text-sm mb-1">📷</div>
            <div className="text-text-muted text-xs">
              Drop image here or click to upload
            </div>
          </div>
        </div>
      </div>
      <div className="h-10 rounded-lg border-2 border-dashed border-border bg-bg-subtle/50 flex items-center justify-center mb-4 relative overflow-hidden text-text-muted text-xs">
        Write your caption...
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex gap-1.5">
          {PLATFORM_ICONS.map((p) => (
            <div
              key={p.name}
              className={`w-8 h-8 rounded-lg ${p.color} flex items-center justify-center text-white shadow-sm`}
              title={p.name}
            >
              <p.icon className="w-4 h-4" />
            </div>
          ))}
        </div>
        <button className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors shadow-md">
          Post to all
        </button>
      </div>
    </div>
  );
}
