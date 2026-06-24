"use client";

import { useEffect } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { Check } from "lucide-react";
import { FaLinkedin } from "react-icons/fa";
import {
  SiInstagram,
  SiYoutube,
  SiPinterest,
  SiTiktok,
  SiX,
  SiThreads,
  SiBluesky,
  SiFacebook,
} from "react-icons/si";

const PLATFORMS = [
  { name: "LinkedIn", Icon: FaLinkedin, color: "bg-[#0A66C2]" },
  {
    name: "Instagram",
    Icon: SiInstagram,
    color: "bg-gradient-to-br from-[#F58529] to-[#8134AF]",
  },
  { name: "YouTube", Icon: SiYoutube, color: "bg-[#FF0000]" },
  { name: "Pinterest", Icon: SiPinterest, color: "bg-[#E60023]" },
  { name: "Facebook", Icon: SiFacebook, color: "bg-[#1877F2]" },
  { name: "X", Icon: SiX, color: "bg-gray-900" },
  { name: "TikTok", Icon: SiTiktok, color: "bg-gray-900" },
  { name: "Threads", Icon: SiThreads, color: "bg-gray-800" },
  { name: "Bluesky", Icon: SiBluesky, color: "bg-[#0085FF]" },
];

function fireConfetti() {
  const duration = 3_000;
  const end = Date.now() + duration;
  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0"],
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0"],
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

export function OnboardingStep4Client() {
  useEffect(() => {
    fireConfetti();
  }, []);

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center max-w-2xl mx-auto text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500 text-white mb-6">
        <Check className="w-10 h-10" strokeWidth={3} />
      </div>
      <h1 className="mb-3 font-serif text-3xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-4xl">
        You&apos;re all set! 🎉
      </h1>
      <p className="text-muted-foreground mb-8">
        Create and schedule your first post in under a minute.
      </p>

      <div className="flex flex-wrap justify-center gap-3 mb-8">
        {PLATFORMS.map(({ name, Icon, color }) => (
          <div
            key={name}
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${color} text-white`}
            title={name}
          >
            <Icon className="h-5 w-5" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Link
          href="/dashboard/composer"
          className="inline-flex items-center justify-center w-full rounded-xl bg-emerald-500 px-6 py-4 text-base font-semibold text-white hover:bg-emerald-600 transition-colors"
        >
          Schedule Your First Post →
        </Link>
        <p className="text-sm text-muted-foreground">
          or{" "}
          <Link
            href="/dashboard"
            className="font-medium text-foreground hover:underline"
          >
            Go to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
