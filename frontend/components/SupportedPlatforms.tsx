"use client";

import { RevealSection } from "@/components/RevealSection";
import {
  SiLinkedin,
  SiInstagram,
  SiYoutube,
  SiPinterest,
  SiTiktok,
  SiX,
  SiThreads,
  SiBluesky,
} from "react-icons/si";

const PLATFORMS = [
  { name: "LinkedIn", icon: SiLinkedin, color: "bg-[#0A66C2]", textColor: "text-white", capabilities: "Text, Images, Video" },
  {
    name: "Instagram",
    icon: SiInstagram,
    color: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
    textColor: "text-white",
    capabilities: "Images, Video, Reels",
  },
  { name: "YouTube", icon: SiYoutube, color: "bg-[#FF0000]", textColor: "text-white", capabilities: "Videos, Shorts" },
  { name: "Pinterest", icon: SiPinterest, color: "bg-[#E60023]", textColor: "text-white", capabilities: "Images, Pins" },
  { name: "TikTok", icon: SiTiktok, color: "bg-[#000000]", textColor: "text-white", capabilities: "Videos, Shorts" },
  { name: "X", icon: SiX, color: "bg-[#000000]", textColor: "text-white", capabilities: "Text, Images, Video" },
  { name: "Threads", icon: SiThreads, color: "bg-[#000000]", textColor: "text-white", capabilities: "Text, Images" },
  { name: "Bluesky", icon: SiBluesky, color: "bg-[#0085FF]", textColor: "text-white", capabilities: "Text, Images" },
];

export function SupportedPlatforms() {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <RevealSection>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center mb-3">
            Supported platforms
          </h2>
          <p className="text-base text-gray-500 text-center max-w-xl mx-auto mb-10 font-medium">
            Connect the networks you use. We add more over time.
          </p>
        </RevealSection>
        <RevealSection delay={1}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {PLATFORMS.map((p) => (
              <div
                key={p.name}
                className={`rounded-xl ${p.color} ${p.textColor} p-4 shadow-md hover:shadow-lg transition-all hover:scale-105 cursor-pointer`}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center mb-2">
                    <p.icon className="w-6 h-6" />
                  </div>
                  <div className="font-bold text-sm mb-1">{p.name}</div>
                  <div className="text-xs opacity-90">{p.capabilities}</div>
                </div>
              </div>
            ))}
          </div>
        </RevealSection>
      </div>
    </section>
  );
}
