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
} from "react-icons/si";

const PLATFORMS = [
  { name: "LinkedIn", icon: SiLinkedin, color: "bg-[#0A66C2]" },
  { name: "Instagram", icon: SiInstagram, color: "bg-gradient-to-br from-[#F58529] to-[#8134AF]" },
  { name: "YouTube", icon: SiYoutube, color: "bg-[#FF0000]" },
  { name: "Pinterest", icon: SiPinterest, color: "bg-[#E60023]" },
  { name: "X", icon: SiX, color: "bg-gray-900" },
  { name: "TikTok", icon: SiTiktok, color: "bg-gray-900" },
  { name: "Threads", icon: SiThreads, color: "bg-gray-800" },
  { name: "Bluesky", icon: SiBluesky, color: "bg-[#0085FF]" },
];

export function HeroMockup() {
  return (
    <div className="w-full max-w-4xl mx-auto mt-14 sm:mt-16 px-4">
      <div 
        className="rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/20 overflow-hidden transform transition-transform hover:scale-[1.01]"
        style={{ 
          transform: 'perspective(1000px) rotateX(1deg)',
          transformStyle: 'preserve-3d'
        }}
      >
        {/* Fake browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400/80" />
            <div className="w-3 h-3 rounded-full bg-amber-400/80" />
            <div className="w-3 h-3 rounded-full bg-red-400/80" />
          </div>
          <div className="flex-1 mx-4 h-6 rounded-md bg-white border border-gray-200 text-gray-400 text-xs flex items-center px-3">
            app.social0.com/dashboard
          </div>
        </div>

        {/* Compose area */}
        <div className="p-6 sm:p-8">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            New post
          </div>
          <div className="space-y-3 mb-6">
            <div className="text-sm text-gray-900 font-medium leading-relaxed">
              Excited to announce our new product launch! 🚀
            </div>
            <div className="text-sm text-gray-700 leading-relaxed">
              After months of development, we're thrilled to share what we've been building. This is a game-changer for our industry.
            </div>
            <div className="text-sm text-gray-600 leading-relaxed">
              #innovation #productlaunch #tech
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-100">
            <div className="flex gap-2 flex-wrap">
              {PLATFORMS.map((p) => (
                <div
                  key={p.name}
                  className={`w-9 h-9 rounded-lg ${p.color} flex items-center justify-center text-white shadow-sm transition-transform hover:scale-110 cursor-pointer`}
                  title={p.name}
                >
                  <p.icon className="w-5 h-5" />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition-colors shadow-sm">
                Schedule
              </button>
              <button className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-md">
                Publish
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
