import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/AppLink";
import confetti from "canvas-confetti";
import type { CreateTypes } from "canvas-confetti";
import { Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOnboardingStatus } from "@/api/onboarding";
import { goalCopy } from "@/features/onboarding/lib/goals";
import { PlatformStrip } from "@/components/landing/PlatformStrip";
import {
  OnboardingDocsLink,
  OnboardingStepFrame,
  OnboardingStepHeader,
  onboardingGhostLinkClass,
  onboardingPrimaryCtaClass,
} from "@/features/onboarding/components/onboarding-ui";
import { DOCS_ONBOARDING_COMPLETE_URL } from "@/lib/docs-url";
import { cn } from "@/lib/utils";

const COLORS = [
  "#10b981",
  "#34d399",
  "#6ee7b7",
  "#FFD93D",
  "#4D96FF",
  "#FFFFFF",
];

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function fireBurst(fire: CreateTypes) {
  void fire({
    particleCount: 100,
    spread: 360,
    startVelocity: 42,
    ticks: 120,
    gravity: 0.55,
    scalar: 1.35,
    shapes: ["star", "circle"],
    colors: COLORS,
    origin: { x: 0.5, y: 0.38 },
    disableForReducedMotion: true,
  });

  const end = Date.now() + 2200;
  const id = window.setInterval(() => {
    if (Date.now() > end) {
      clearInterval(id);
      return;
    }
    void fire({
      particleCount: 28,
      startVelocity: 36,
      spread: 360,
      ticks: 90,
      colors: COLORS,
      shapes: ["circle"],
      origin: {
        x: randomInRange(0.15, 0.35),
        y: randomInRange(0.15, 0.35),
      },
      disableForReducedMotion: true,
    });
    void fire({
      particleCount: 28,
      startVelocity: 36,
      spread: 360,
      ticks: 90,
      colors: COLORS,
      shapes: ["circle"],
      origin: {
        x: randomInRange(0.65, 0.85),
        y: randomInRange(0.15, 0.35),
      },
      disableForReducedMotion: true,
    });
  }, 280);

  return () => clearInterval(id);
}

export function ReadyStep() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireRef = useRef<CreateTypes | null>(null);
  const { data: status } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: getOnboardingStatus,
  });
  const hint = goalCopy(status?.onboardingGoal).readyHint;

  const sizeCanvas = (node: HTMLCanvasElement) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    node.width = Math.floor(window.innerWidth * dpr);
    node.height = Math.floor(window.innerHeight * dpr);
    node.style.width = `${window.innerWidth}px`;
    node.style.height = `${window.innerHeight}px`;
  };

  const bindCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (!node) {
      fireRef.current = null;
      return;
    }
    sizeCanvas(node);
    fireRef.current = confetti.create(node, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stopInterval: (() => void) | undefined;

    const tryStart = () => {
      if (cancelled || !fireRef.current) return false;
      stopInterval = fireBurst(fireRef.current);
      return true;
    };

    let readyTimer: number | undefined;
    if (!tryStart()) {
      readyTimer = window.setInterval(() => {
        if (tryStart() && readyTimer != null) clearInterval(readyTimer);
      }, 40);
    }

    return () => {
      cancelled = true;
      if (readyTimer != null) clearInterval(readyTimer);
      stopInterval?.();
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (canvasRef.current) sizeCanvas(canvasRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <OnboardingStepFrame
      narrow
      className="items-center justify-center text-center"
    >
      {createPortal(
        <canvas
          ref={bindCanvas}
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483646,
            pointerEvents: "none",
            width: "100vw",
            height: "100vh",
          }}
        />,
        document.body,
      )}

      <div className="relative w-full">
        <OnboardingDocsLink href={DOCS_ONBOARDING_COMPLETE_URL} />

        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-[#04140c] shadow-[0_0_40px_-8px_rgba(16,185,129,0.7)]">
          <Check className="h-8 w-8" strokeWidth={3} />
        </div>

        <OnboardingStepHeader
          eyebrow="You're in"
          title={
            <>
              Ready to{" "}
              <em className="not-italic text-emerald-600 dark:text-emerald-400">
                schedule your first post ?
              </em>
            </>
          }
          description={hint}
        />

        <div className="mb-8 flex justify-center">
          <PlatformStrip variant="hero" className="max-w-sm scale-90" />
        </div>

        <div className="mx-auto mb-8 grid max-w-md gap-2 text-left text-[13px] text-muted-foreground">
          {[
            "Write once — publish to every connected account",
            "Schedule ahead or go live now",
            "Upgrade later when you need more accounts",
          ].map((item) => (
            <div
              key={item}
              className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/60 px-3.5 py-2.5"
            >
              <span className="mt-0.5 text-emerald-500" aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <Link
            href="/dashboard/composer"
            className={cn(onboardingPrimaryCtaClass, "w-full sm:w-auto")}
          >
            Schedule your first post
            <span aria-hidden>→</span>
          </Link>
          <Link href="/dashboard" className={onboardingGhostLinkClass}>
            Go to dashboard
          </Link>
        </div>
      </div>
    </OnboardingStepFrame>
  );
}
