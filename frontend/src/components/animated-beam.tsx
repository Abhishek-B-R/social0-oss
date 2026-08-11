import { type RefObject, useEffect, useId, useState } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  /** Pause between animation loops, in seconds. Allows sequencing multiple beams. */
  repeatDelay?: number;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
  /**
   * Draw rim→rim (circle edge to circle edge) instead of center→center.
   * Avoids beams looking like they share one exit point on the hub.
   */
  edgeAttach?: boolean;
  /** When false, only the static track is drawn (no traveling green signal). */
  animated?: boolean;
}

/** MagicUI Animated Beam - https://magicui.design/docs/components/animated-beam */
export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration: durationProp,
  delay = 0,
  repeatDelay = 0,
  pathColor = "gray",
  pathWidth = 2,
  pathOpacity = 0.2,
  gradientStartColor = "#ffaa40",
  gradientStopColor = "#9c40ff",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
  edgeAttach = false,
  animated = true,
}) => {
  const id = useId();
  const [pathD, setPathD] = useState("");
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  const [randomDuration] = useState(() => Math.random() * 3 + 4);
  const duration = durationProp ?? randomDuration;

  const gradientCoordinates = reverse
    ? {
        x1: ["90%", "-10%"],
        x2: ["100%", "0%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      }
    : {
        // Wider gap = longer traveling blob
        x1: ["10%", "110%"],
        x2: ["-15%", "85%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      };

  useEffect(() => {
    const updatePath = () => {
      if (containerRef.current && fromRef.current && toRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const rectA = fromRef.current.getBoundingClientRect();
        const rectB = toRef.current.getBoundingClientRect();

        const svgWidth = containerRect.width;
        const svgHeight = containerRect.height;
        setSvgDimensions({ width: svgWidth, height: svgHeight });

        const centerAX =
          rectA.left - containerRect.left + rectA.width / 2 + startXOffset;
        const centerAY =
          rectA.top - containerRect.top + rectA.height / 2 + startYOffset;
        const centerBX =
          rectB.left - containerRect.left + rectB.width / 2 + endXOffset;
        const centerBY =
          rectB.top - containerRect.top + rectB.height / 2 + endYOffset;

        let startX = centerAX;
        let startY = centerAY;
        let endX = centerBX;
        let endY = centerBY;
        let d: string;

        if (edgeAttach) {
          const dx = centerBX - centerAX;
          const dy = centerBY - centerAY;
          const dist = Math.hypot(dx, dy) || 1;
          const ux = dx / dist;
          const uy = dy / dist;
          const rA = Math.min(rectA.width, rectA.height) / 2 - 1;
          const rB = Math.min(rectB.width, rectB.height) / 2 - 1;
          startX = centerAX + ux * rA;
          startY = centerAY + uy * rA;
          endX = centerBX - ux * rB;
          endY = centerBY - uy * rB;

          if (curvature === 0) {
            d = `M ${startX},${startY} L ${endX},${endY}`;
          } else {
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const cx = midX - uy * curvature;
            const cy = midY + ux * curvature;
            d = `M ${startX},${startY} Q ${cx},${cy} ${endX},${endY}`;
          }
        } else {
          const controlY = startY - curvature;
          d = `M ${startX},${startY} Q ${(startX + endX) / 2},${controlY} ${endX},${endY}`;
        }

        setPathD(d);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updatePath();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    updatePath();

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    containerRef,
    fromRef,
    toRef,
    curvature,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
    edgeAttach,
  ]);

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "pointer-events-none absolute left-0 top-0 transform-gpu stroke-2",
        className,
      )}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
    >
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />
      {animated ? (
        <>
          <path
            d={pathD}
            strokeWidth={pathWidth}
            stroke={`url(#${id})`}
            strokeOpacity="1"
            strokeLinecap="round"
          />
          <defs>
            <motion.linearGradient
              className="transform-gpu"
              id={id}
              gradientUnits="userSpaceOnUse"
              initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
              animate={{
                x1: gradientCoordinates.x1,
                x2: gradientCoordinates.x2,
                y1: gradientCoordinates.y1,
                y2: gradientCoordinates.y2,
              }}
              transition={{
                delay,
                duration,
                ease: [0.16, 1, 0.3, 1],
                repeat: Infinity,
                repeatDelay,
              }}
            >
              <stop stopColor={gradientStartColor} stopOpacity="0" />
              <stop stopColor={gradientStartColor} />
              <stop offset="32.5%" stopColor={gradientStopColor} />
              <stop
                offset="100%"
                stopColor={gradientStopColor}
                stopOpacity="0"
              />
            </motion.linearGradient>
          </defs>
        </>
      ) : null}
    </svg>
  );
};
