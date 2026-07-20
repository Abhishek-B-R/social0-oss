import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "@/components/AppLink";
import confetti from "canvas-confetti";
import type { CreateTypes } from "canvas-confetti";
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

const COLORS = [
  "#FF6B6B",
  "#FFD93D",
  "#6BCB77",
  "#4D96FF",
  "#C77DFF",
  "#FF8C42",
  "#00F5D4",
  "#F72585",
  "#FFE400",
  "#FFFFFF",
];

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function fireBurst(fire: CreateTypes) {
  void fire({
    particleCount: 120,
    spread: 360,
    startVelocity: 48,
    ticks: 140,
    gravity: 0.55,
    scalar: 1.6,
    shapes: ["star"],
    colors: COLORS,
    origin: { x: 0.5, y: 0.4 },
    disableForReducedMotion: false,
  });
  void fire({
    particleCount: 80,
    spread: 360,
    startVelocity: 38,
    ticks: 120,
    gravity: 0.65,
    scalar: 1.15,
    shapes: ["circle", "square"],
    colors: COLORS,
    origin: { x: 0.5, y: 0.4 },
    disableForReducedMotion: false,
  });

  const end = Date.now() + 4000;
  const id = window.setInterval(() => {
    if (Date.now() > end) {
      clearInterval(id);
      return;
    }
    void fire({
      particleCount: 50,
      startVelocity: 42,
      spread: 360,
      ticks: 100,
      colors: COLORS,
      shapes: ["star", "circle"],
      origin: {
        x: randomInRange(0.12, 0.35),
        y: randomInRange(0.12, 0.35),
      },
      disableForReducedMotion: false,
    });
    void fire({
      particleCount: 50,
      startVelocity: 42,
      spread: 360,
      ticks: 100,
      colors: COLORS,
      shapes: ["star", "circle"],
      origin: {
        x: randomInRange(0.65, 0.88),
        y: randomInRange(0.12, 0.35),
      },
      disableForReducedMotion: false,
    });
  }, 220);

  return () => clearInterval(id);
}

export function OnboardingStep4() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireRef = useRef<CreateTypes | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

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
      disableForReducedMotion: false,
    });
  }, []);

  const celebrate = useCallback(() => {
    stopRef.current?.();
    const fire = fireRef.current;
    if (!fire) {
      console.warn("[onboarding] confetti not ready");
      return;
    }
    if (canvasRef.current) sizeCanvas(canvasRef.current);
    console.log("[onboarding] firing confetti");
    stopRef.current = fireBurst(fire);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stopInterval: (() => void) | undefined;

    const tryStart = () => {
      if (cancelled || !fireRef.current) return false;
      stopInterval = fireBurst(fireRef.current);
      return true;
    };

    // Canvas callback ref usually wins the race; poll briefly if not.
    let readyTimer: number | undefined;
    if (!tryStart()) {
      readyTimer = window.setInterval(() => {
        if (tryStart() && readyTimer != null) clearInterval(readyTimer);
      }, 40);
    }

    // Second burst after StrictMode remount / layout settles.
    const second = window.setTimeout(() => {
      if (!cancelled && fireRef.current) {
        stopInterval?.();
        stopInterval = fireBurst(fireRef.current);
      }
    }, 500);

    return () => {
      cancelled = true;
      if (readyTimer != null) clearInterval(readyTimer);
      clearTimeout(second);
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
    <div className="relative flex w-full max-w-2xl flex-1 flex-col items-center justify-center mx-auto text-center">
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

      <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_40px_-8px_rgba(16,185,129,0.7)]">
        <Check className="h-10 w-10" strokeWidth={3} />
      </div>

      <h1 className="mb-3 font-serif text-3xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-4xl">
        You&apos;re all set!
      </h1>
      <p className="mb-8 text-muted-foreground">
        Create and schedule your first post in under a minute.
      </p>

      <div className="mb-8 flex flex-wrap justify-center gap-3">
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
          className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-emerald-600"
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
