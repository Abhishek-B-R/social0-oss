

import React, { createRef, forwardRef, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { User } from "lucide-react";

import { cn } from "@/lib/utils";
import { AnimatedBeam } from "@/components/magicui/animated-beam";
import {
  XIcon,
  InstagramIcon,
  LinkedInIcon,
  YouTubeIcon,
  TikTokIcon,
} from "./PlatformIcons";

/**
 * Storytelling loop (seconds). The beam ease is a steep ease-out, so the
 * visible head lands at ~60% of each leg's duration - pulse/glow are timed
 * to those arrivals, not to the end of the leg.
 *   0.0        beam leaves the user
 *   ~0.8 – 1.4 Social0 pulses as the post arrives
 *   1.5        Social0 dispatches to all platforms at once
 *   ~2.3 – 3.0 platforms glow as posts land
 *   then a short idle, repeat
 */
const CYCLE = 6;
const LEG_DURATION = 2.2;
const DISPATCH_DELAY = 2.3;
const REPEAT_DELAY = CYCLE - LEG_DURATION;

const HUB_PULSE_TIMES = [0, 1.3 / CYCLE, 1.7 / CYCLE, 2.1 / CYCLE, 1];
const PLATFORM_GLOW_TIMES = [0, 3.6 / CYCLE, 4.1 / CYCLE, 4.6 / CYCLE, 1];

const Circle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode; label?: string }
>(({ className, children, label }, ref) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={ref}
        className={cn(
          // Inverted vs page theme: dark circles on light theme, white circles on dark theme
          "z-10 flex size-14 items-center justify-center rounded-full border border-white/15 bg-[#141414] p-3 shadow-[0_0_20px_-12px_rgba(52,211,153,0.8)] dark:border-neutral-200 dark:bg-white dark:shadow-sm",
          className,
        )}
      >
        {children}
      </div>
      {label && (
        <span className="text-[12px] text-white/45 dark:text-[#0A0A0A]/50">
          {label}
        </span>
      )}
    </div>
  );
});

Circle.displayName = "Circle";

const BEAM_PROPS = {
  duration: LEG_DURATION,
  repeatDelay: REPEAT_DELAY,
  pathOpacity: 1,
  gradientStartColor: "#34d399",
  gradientStopColor: "#6ee7b7",
  // Base path color comes from CSS below so it can follow the theme.
  // In dark mode (light card) the light emerald gradient washes out, so the
  // gradient stops and base tracks are overridden with darker shades.
  pathColor: "transparent",
  className:
    "[&>path:first-of-type]:stroke-white/25 dark:[&>path:first-of-type]:stroke-black/15 dark:[&_stop]:[stop-color:#047857] dark:[&>path:nth-of-type(2)]:stroke-[2.5px]",
};

/**
 * Animated flow: you → Social0 → every platform (MagicUI Animated Beam).
 * Renders inverted vs the page theme: dark card on light theme, light card on dark.
 */
export function FlowAnimation({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);

  const platforms = useMemo(
    () =>
      [
        { icon: XIcon, name: "X (Twitter)" },
        { icon: InstagramIcon, name: "Instagram" },
        { icon: TikTokIcon, name: "TikTok" },
        { icon: YouTubeIcon, name: "YouTube" },
        { icon: LinkedInIcon, name: "LinkedIn" },
      ].map((p) => ({ ...p, ref: createRef<HTMLDivElement>() })),
    [],
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A] dark:border-border dark:bg-[#FAFAF8]",
        className,
      )}
    >
      {/* Fake browser bar - gives the diagram product context */}
      <div className="flex items-center gap-2 border-b border-white/6 bg-[#141414] px-4 py-3 dark:border-border dark:bg-[#F0EEE9]">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28CA41]" />
        </div>
        <div className="ml-3 rounded bg-white/5 px-3 py-1 font-mono text-[11px] text-white/25 dark:bg-black/4 dark:text-black/30">
          social0.app/publish
        </div>
      </div>

      {/* Subtle dot grid fills the canvas so the diagram doesn't float in emptiness */}
      <div className="pointer-events-none absolute inset-0 top-[42px] bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-size-[20px_20px] dark:bg-[radial-gradient(rgba(0,0,0,0.05)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(26,107,74,0.14),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(26,107,74,0.07),transparent_60%)]" />

      <div
        className="relative flex w-full items-center justify-center overflow-hidden p-6 md:p-8"
        ref={containerRef}
      >
        <div className="flex size-full max-w-2xl flex-row items-stretch justify-between gap-8">
          <div className="flex flex-col justify-center">
            <Circle ref={userRef} label="You">
              <User
                className="h-6 w-6 text-white/80 dark:text-neutral-800"
                strokeWidth={1.8}
              />
            </Circle>
          </div>
          <div className="flex flex-col justify-center">
            {/* Pulse when the user's post arrives */}
            <motion.div
              animate={{ scale: [1, 1, 1.09, 1, 1] }}
              transition={{
                duration: CYCLE,
                times: HUB_PULSE_TIMES,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Circle
                ref={hubRef}
                className="size-20 border-emerald-500/40 p-1.5 shadow-[0_0_40px_rgba(16,185,129,0.18)] dark:border-emerald-600/40 dark:bg-[#0A0A0A] dark:shadow-[0_0_40px_rgba(16,185,129,0.16)]"
              >
                {/* Max contrast vs the card: white node on dark card, black node on light card */}
                <img
                  src="/logo-circular.png"
                  alt="Social0"
                  className="h-full w-full rounded-full dark:hidden"
                />
                <img
                  src="/logo-dark.png"
                  alt="Social0"
                  className="hidden h-full w-full rounded-full dark:block"
                />
              </Circle>
            </motion.div>
          </div>
          <div className="flex flex-col justify-center gap-4">
            {platforms.map((p) => (
              <div key={p.name} className="relative">
                {/* Glow when the dispatched post lands */}
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_22px_2px_rgba(52,211,153,0.4)]"
                  animate={{ opacity: [0, 0, 1, 0, 0] }}
                  transition={{
                    duration: CYCLE,
                    times: PLATFORM_GLOW_TIMES,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <Circle ref={p.ref}>
                  <p.icon
                    className="h-[18px] w-[18px] text-white/85 dark:text-neutral-800"
                    fill="currentColor"
                    aria-label={p.name}
                  />
                </Circle>
              </div>
            ))}
          </div>
        </div>

        {/* Leg 1: user → Social0 */}
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={userRef}
          toRef={hubRef}
          {...BEAM_PROPS}
        />
        {/* Leg 2: Social0 → every platform, dispatched after the post arrives */}
        {platforms.map((p) => (
          <AnimatedBeam
            key={p.name}
            containerRef={containerRef}
            fromRef={hubRef}
            toRef={p.ref}
            delay={DISPATCH_DELAY}
            {...BEAM_PROPS}
          />
        ))}
      </div>
    </div>
  );
}
