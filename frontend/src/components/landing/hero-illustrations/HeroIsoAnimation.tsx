import { motion } from "framer-motion";
import { HeroTopIllustration } from "./HeroIsoTop";
import { HeroMiddleIllustration } from "./HeroIsoMiddle";
import { HeroBottomIllustration } from "./HeroIsoBottom";

const EXPLOSION = {
  duration: 0.7,
  stagger: 0.1,
  initialDelay: 0.35,
} as const;

/** Compact stack so hero + Publishes-to fit in first viewport */
const FINAL_Y = {
  top: -36,
  middle: 0,
  bottom: 28,
} as const;

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const CORNERS = {
  topToMiddle: [
    { x: 200, y: 110 },
    { x: -100, y: 110 },
  ],
  middleToBottom: [
    { x: 210, y: 200 },
    { x: -95, y: 200 },
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
      animate={{ scaleY: 1, opacity: 0.45 }}
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
          strokeDasharray="5 5"
          strokeWidth="1.5"
        />
      </svg>
    </motion.div>
  );
}

export function HeroIsoAnimation({ className = "" }: { className?: string }) {
  const lineHeight = Math.abs(FINAL_Y.top);

  return (
    <div className={`relative pb-6 sm:pb-8 ${className}`}>
      <div className="mt-2 flex flex-col items-center sm:mt-4">
        <motion.div
          className="relative z-30 flex justify-center"
          initial={{ y: 0, opacity: 0.6 }}
          animate={{ y: FINAL_Y.top, opacity: 1 }}
          transition={{
            duration: EXPLOSION.duration,
            ease: EASE_OUT,
            delay: EXPLOSION.initialDelay,
          }}
        >
          <HeroTopIllustration className="h-auto w-[min(560px,88vw)]" />
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
          className="relative z-20 -mt-36 ml-4 flex justify-center sm:-mt-40 md:-mt-44 md:ml-8"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          transition={{ delay: EXPLOSION.initialDelay + 0.08, duration: 0.5 }}
        >
          <HeroMiddleIllustration className="h-auto w-[min(420px,72vw)]" />
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
          className="relative z-10 -mt-32 ml-0.5 flex justify-center sm:-mt-36 md:-mt-40"
          initial={{ y: 0, opacity: 0.5 }}
          animate={{ y: FINAL_Y.bottom, opacity: 1 }}
          transition={{
            duration: EXPLOSION.duration,
            ease: EASE_OUT,
            delay: EXPLOSION.initialDelay,
          }}
        >
          <HeroBottomIllustration className="h-auto w-[min(500px,80vw)]" />
        </motion.div>
      </div>
    </div>
  );
}
