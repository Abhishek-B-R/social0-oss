import { motion } from "framer-motion";
import { HeroTopIllustration } from "./HeroIsoTop";
import { HeroMiddleIllustration } from "./HeroIsoMiddle";
import { HeroBottomIllustration } from "./HeroIsoBottom";

const EXPLOSION = {
  duration: 0.85,
  stagger: 0.12,
  initialDelay: 0.45,
} as const;

const FINAL_Y = {
  top: -72,
  middle: 0,
  bottom: 56,
} as const;

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const CORNERS = {
  topToMiddle: [
    { x: 260, y: 155 },
    { x: -130, y: 155 },
  ],
  middleToBottom: [
    { x: 270, y: 290 },
    { x: -120, y: 290 },
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
      animate={{ scaleY: 1, opacity: 0.55 }}
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

export function HeroIsoAnimation({ className = "" }: { className?: string }) {
  const lineHeight = Math.abs(FINAL_Y.top);

  return (
    <div className={`relative pb-20 sm:pb-24 md:pb-28 ${className}`}>
      <div className="mt-6 flex flex-col items-center sm:mt-10 md:mt-12">
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
          <HeroTopIllustration className="h-auto w-[min(720px,92vw)]" />
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
          className="relative z-20 -mt-48 ml-6 flex justify-center sm:-mt-56 md:-mt-60 md:ml-12"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          transition={{ delay: EXPLOSION.initialDelay + 0.1, duration: 0.6 }}
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
          className="relative z-10 -mt-44 ml-1 flex justify-center sm:-mt-52 md:-mt-56"
          initial={{ y: 0, opacity: 0.5 }}
          animate={{ y: FINAL_Y.bottom, opacity: 1 }}
          transition={{
            duration: EXPLOSION.duration,
            ease: EASE_OUT,
            delay: EXPLOSION.initialDelay,
          }}
        >
          <HeroBottomIllustration className="h-auto w-[min(660px,90vw)]" />
        </motion.div>
      </div>
    </div>
  );
}
