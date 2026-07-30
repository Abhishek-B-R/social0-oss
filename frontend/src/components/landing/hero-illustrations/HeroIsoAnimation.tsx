import { motion } from "framer-motion";
import { HeroTopIllustration } from "./HeroIsoTop";
import { HeroTopAgentIllustration } from "./HeroIsoTopAgent";
import { HeroMiddleIllustration } from "./HeroIsoMiddle";
import { HeroBottomIllustration } from "./HeroIsoBottom";
import type { LandingMode } from "../landing-mode";

const EXPLOSION = {
  duration: 1.05,
  stagger: 0.08,
  initialDelay: 0.15,
} as const;

/** Fully stacked on the middle layer before exploding out. */
const INITIAL_Y = {
  top: 120,
  middle: 0,
  bottom: -100,
} as const;

const FINAL_Y = {
  top: -64,
  middle: 0,
  bottom: 48,
} as const;

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const CORNERS = {
  topToMiddle: [
    { x: 170, y: 140 },
    { x: -170, y: 140 },
  ],
  middleToBottom: [
    { x: 170, y: 260 },
    { x: -170, y: 260 },
  ],
} as const;

function ConnectingLine({
  x,
  topOffset,
  height,
  delay,
  direction,
}: {
  x: number;
  topOffset: number;
  height: number;
  delay: number;
  direction: "up" | "down";
}) {
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{
        left: `calc(50% + ${x}px)`,
        top: topOffset,
        transformOrigin: direction === "up" ? "bottom center" : "top center",
      }}
      initial={{ scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 0.5 }}
      transition={{
        duration: EXPLOSION.duration,
        ease: EASE_OUT,
        delay,
      }}
    >
      <svg
        width="2"
        height={height}
        viewBox={`0 0 2 ${height}`}
        fill="none"
        aria-hidden
      >
        <line
          x1="1"
          y1="0"
          x2="1"
          y2={height}
          stroke="#34d399"
          strokeDasharray="6 6"
          strokeWidth="1.5"
        />
      </svg>
    </motion.div>
  );
}

export function HeroIsoAnimation({
  className = "",
  mode = "normal",
}: {
  className?: string;
  mode?: LandingMode;
}) {
  const lineHeight = Math.abs(FINAL_Y.top);

  // Remount on mode change so Normal ↔ Agent replays the full collapse → explode.
  return (
    <div key={mode} className={`relative pb-14 sm:pb-16 ${className}`}>
      <div className="mt-8 flex flex-col items-center sm:mt-12 md:mt-14">
        <motion.div
          className="relative z-30 flex w-full justify-center"
          initial={{ y: INITIAL_Y.top, opacity: 0.75, scale: 0.96 }}
          animate={{ y: FINAL_Y.top, opacity: 1, scale: 1 }}
          transition={{
            duration: EXPLOSION.duration,
            ease: EASE_OUT,
            delay: EXPLOSION.initialDelay,
          }}
        >
          {mode === "agent" ? (
            <HeroTopAgentIllustration className="h-auto w-[min(860px,100vw)] origin-bottom scale-110 sm:scale-[1.12] md:scale-[1.15]" />
          ) : (
            <HeroTopIllustration className="h-auto w-[min(860px,100vw)] origin-bottom scale-110 sm:scale-[1.12] md:scale-[1.15]" />
          )}
        </motion.div>

        <div className="pointer-events-none absolute inset-0 z-25">
          {CORNERS.topToMiddle.map((corner, index) => (
            <ConnectingLine
              key={`tm-${index}`}
              x={corner.x}
              topOffset={corner.y}
              height={lineHeight}
              delay={EXPLOSION.initialDelay}
              direction="up"
            />
          ))}
        </div>

        <motion.div
          className="relative z-20 -mt-48 flex w-full justify-center sm:-mt-56 md:-mt-60"
          initial={{ opacity: 0.65, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: EXPLOSION.initialDelay,
            duration: EXPLOSION.duration,
            ease: EASE_OUT,
          }}
        >
          <HeroMiddleIllustration className="h-auto w-[min(540px,82vw)]" />
        </motion.div>

        <div className="pointer-events-none absolute inset-0 z-15">
          {CORNERS.middleToBottom.map((corner, index) => (
            <ConnectingLine
              key={`mb-${index}`}
              x={corner.x}
              topOffset={corner.y}
              height={Math.abs(FINAL_Y.bottom)}
              delay={EXPLOSION.initialDelay}
              direction="down"
            />
          ))}
        </div>

        <motion.div
          className="relative z-10 -mt-44 flex w-full justify-center sm:-mt-52 md:-mt-56"
          initial={{ y: INITIAL_Y.bottom, opacity: 0.75, scale: 0.96 }}
          animate={{ y: FINAL_Y.bottom, opacity: 1, scale: 1 }}
          transition={{
            duration: EXPLOSION.duration,
            ease: EASE_OUT,
            delay: EXPLOSION.initialDelay + EXPLOSION.stagger,
          }}
        >
          <HeroBottomIllustration className="h-auto w-[min(660px,90vw)]" />
        </motion.div>
      </div>
    </div>
  );
}
