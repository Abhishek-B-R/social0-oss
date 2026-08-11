import React, {
  createRef,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { AnimatedBeam } from "@/components/animated-beam";
import { PlatformBrandIcon } from "./PlatformStrip";
import { useLandingMode } from "./landing-mode";

/**
 * Storytelling loop (seconds), per sender:
 *   0.0        brighten active sender
 *   0.35       green signal on that cord
 *   ~1.2–1.6   Social0 pulses as the post arrives
 *   ~1.5       Social0 → all platforms
 *   short idle; agent mode flips You ↔ Your agents for the next loop
 */
const CYCLE = 4.5;
const BRIGHTEN_BEFORE_SIGNAL = 0.35;
const LEG_DURATION = 1.85;
const DISPATCH_AFTER_SIGNAL_START = 1.15;
const PLATFORM_DELAY = BRIGHTEN_BEFORE_SIGNAL + DISPATCH_AFTER_SIGNAL_START;
const REPEAT_DELAY = Math.max(0.25, CYCLE - LEG_DURATION - BRIGHTEN_BEFORE_SIGNAL);

const HUB_PULSE_TIMES = [
  0,
  (BRIGHTEN_BEFORE_SIGNAL + 0.55) / CYCLE,
  (BRIGHTEN_BEFORE_SIGNAL + 0.85) / CYCLE,
  (BRIGHTEN_BEFORE_SIGNAL + 1.15) / CYCLE,
  1,
];
const PLATFORM_GLOW_TIMES = [
  0,
  (PLATFORM_DELAY + 0.25) / CYCLE,
  (PLATFORM_DELAY + 0.55) / CYCLE,
  (PLATFORM_DELAY + 0.9) / CYCLE,
  1,
];

/** Same brand assets as the hero PlatformStrip (subset that fits the vertical column). */
const FLOW_PLATFORMS = [
  { name: "Twitter / X", src: "/icons/x.svg" },
  { name: "Instagram", src: "/icons/instagram.svg" },
  {
    name: "TikTok",
    src: "/icons/tiktok-black.png",
    darkSrc: "/icons/tiktok.png",
    srcScale: 0.7,
  },
  { name: "YouTube", src: "/icons/youtube.svg" },
  { name: "LinkedIn", src: "/icons/linkedin.svg" },
] as const;

const Circle = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    children?: React.ReactNode;
    label?: string;
    dimmed?: boolean;
    active?: boolean;
  }
>(({ className, children, label, dimmed, active }, ref) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 transition-[opacity,transform] duration-300 ease-out",
        dimmed && "opacity-30",
      )}
    >
      <div
        ref={ref}
        className={cn(
          // Match page theme: light nodes on light, dark nodes on dark
          "z-10 flex size-14 items-center justify-center rounded-full border border-neutral-200 bg-white p-2.5 shadow-sm transition-[box-shadow,border-color] duration-300 dark:border-white/15 dark:bg-[#141414] dark:shadow-[0_0_20px_-12px_rgba(52,211,153,0.8)]",
          active &&
            "border-emerald-500/70 shadow-[0_0_24px_rgba(16,185,129,0.35)] dark:border-emerald-400/70 dark:shadow-[0_0_28px_rgba(16,185,129,0.45)]",
          className,
        )}
      >
        {children}
      </div>
      {label && (
        <span
          className={cn(
            "max-w-[5.5rem] text-center text-[12px] font-medium leading-tight text-black/80 transition-colors duration-300 dark:text-white/90",
            dimmed && "text-black/30 dark:text-white/25",
          )}
        >
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
  pathWidth: 4,
  gradientStartColor: "#34d399",
  gradientStopColor: "#6ee7b7",
  pathColor: "transparent",
  edgeAttach: true as const,
  className:
    "[&>path:first-of-type]:stroke-black/15 [&>path:nth-of-type(2)]:stroke-[4px] [&_stop]:[stop-color:#047857] dark:[&>path:first-of-type]:stroke-white/25 dark:[&_stop]:[stop-color:#34d399]",
};

/**
 * Animated flow: You (and Agent in agent mode) → Social0 → platforms.
 * Brighten sender first, then green signal — never the reverse.
 */
export function FlowAnimation({ className }: { className?: string }) {
  const { mode } = useLandingMode();
  const showAgent = mode === "agent";
  const [sender, setSender] = useState<"you" | "agent">("you");
  const [cycleId, setCycleId] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);

  const platforms = useMemo(
    () =>
      FLOW_PLATFORMS.map((p) => ({ ...p, ref: createRef<HTMLDivElement>() })),
    [],
  );

  useEffect(() => {
    if (!showAgent) return;
    const id = window.setInterval(() => {
      setSender((s) => (s === "you" ? "agent" : "you"));
      setCycleId((c) => c + 1);
    }, CYCLE * 1000);
    return () => window.clearInterval(id);
  }, [showAgent]);

  // Derive active sender — don't reset state in an effect when leaving agent mode
  const youActive = !showAgent || sender === "you";
  const agentActive = showAgent && sender === "agent";

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-border bg-[#FAFAF8] dark:border-white/10 dark:bg-[#0A0A0A]",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-[#F0EEE9] px-3 py-2.5 dark:border-white/6 dark:bg-[#141414]">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#FF5F57]" />
          <div className="h-2 w-2 rounded-full bg-[#FFBD2E]" />
          <div className="h-2 w-2 rounded-full bg-[#28CA41]" />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 top-[38px] bg-[radial-gradient(rgba(0,0,0,0.05)_1px,transparent_1px)] bg-size-[18px_18px] dark:bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(26,107,74,0.08),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(26,107,74,0.14),transparent_60%)]" />

      <div
        className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-5 sm:p-7"
        ref={containerRef}
      >
        <div className="flex h-full min-h-[280px] w-full max-w-lg flex-row items-stretch justify-between gap-6 sm:min-h-[320px] sm:gap-8">
          <div
            className={cn(
              "flex flex-col justify-center",
              showAgent ? "gap-6" : "",
            )}
          >
            <Circle
              ref={userRef}
              label="You"
              active={youActive}
            >
              <User
                className="h-6 w-6 text-neutral-800 dark:text-white/80"
                strokeWidth={1.8}
              />
            </Circle>
            {showAgent ? (
              <Circle
                ref={agentRef}
                label="Your agents"
                active={agentActive}
              >
                <Bot
                  className="h-6 w-6 text-neutral-800 dark:text-white/80"
                  strokeWidth={1.8}
                />
              </Circle>
            ) : null}
          </div>
          <div className="flex flex-col justify-center">
            <motion.div
              key={`hub-${cycleId}`}
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
                className="size-[4.75rem] border-emerald-600/50 bg-white p-1 shadow-[0_0_28px_rgba(16,185,129,0.14)] dark:border-emerald-500/40 dark:bg-[#0A0A0A] dark:shadow-[0_0_28px_rgba(16,185,129,0.18)] sm:size-[5.25rem]"
              >
                {/* Match header: circular mark on light, dark mark on dark */}
                <img
                  src="/logo-circular.webp"
                  alt="Social0"
                  width={68}
                  height={68}
                  decoding="async"
                  className="h-full w-full rounded-full dark:hidden"
                />
                <img
                  src="/logo-dark.webp"
                  alt="Social0"
                  width={68}
                  height={68}
                  decoding="async"
                  className="hidden h-full w-full rounded-full dark:block"
                />
              </Circle>
            </motion.div>
          </div>
          <div className="flex flex-col justify-center gap-3.5 sm:gap-4">
            {platforms.map((p) => (
              <div key={p.name} className="relative">
                <motion.div
                  key={`glow-${p.name}-${cycleId}`}
                  className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_18px_2px_rgba(52,211,153,0.35)]"
                  animate={{ opacity: [0, 0, 1, 0, 0] }}
                  transition={{
                    duration: CYCLE,
                    times: PLATFORM_GLOW_TIMES,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <Circle ref={p.ref} className="size-[3.5rem] p-2 sm:size-16 sm:p-2.5">
                  <PlatformBrandIcon
                    name={p.name}
                    src={p.src}
                    darkSrc={"darkSrc" in p ? p.darkSrc : undefined}
                    srcScale={"srcScale" in p ? p.srcScale : 1}
                    size={28}
                  />
                </Circle>
              </div>
            ))}
          </div>
        </div>

        {/* Cords always connected. Green only after brighten (delay), on active sender. */}
        <AnimatedBeam
          key={`you-cord-${youActive ? cycleId : "idle"}`}
          containerRef={containerRef}
          fromRef={userRef}
          toRef={hubRef}
          {...BEAM_PROPS}
          curvature={0}
          animated={youActive}
          delay={youActive ? BRIGHTEN_BEFORE_SIGNAL : 0}
        />
        {showAgent ? (
          <AnimatedBeam
            key={`agent-cord-${agentActive ? cycleId : "idle"}`}
            containerRef={containerRef}
            fromRef={agentRef}
            toRef={hubRef}
            {...BEAM_PROPS}
            curvature={0}
            animated={agentActive}
            delay={agentActive ? BRIGHTEN_BEFORE_SIGNAL : 0}
          />
        ) : null}
        {platforms.map((p) => (
          <AnimatedBeam
            key={`${p.name}-${cycleId}`}
            containerRef={containerRef}
            fromRef={hubRef}
            toRef={p.ref}
            {...BEAM_PROPS}
            curvature={0}
            delay={PLATFORM_DELAY}
          />
        ))}
      </div>
    </div>
  );
}
