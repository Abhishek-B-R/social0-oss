import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Landing-matched primary CTA — dark text on emerald, soft glow. */
export const onboardingPrimaryCtaClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-emerald-500 px-7 py-3 text-[15px] font-semibold text-[#04140c] shadow-[0_0_32px_rgba(16,185,129,0.28)] transition-[transform,background-color] duration-150 ease-out hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:shadow-[0_0_32px_rgba(16,185,129,0.38)]";

export const onboardingSecondaryCtaClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-background/80 px-7 py-3 text-[15px] font-medium text-foreground backdrop-blur-sm transition-[transform,background-color,border-color] duration-150 ease-out hover:border-foreground/20 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const onboardingGhostLinkClass =
  "text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-sm";

type StepFrameProps = {
  children: ReactNode;
  className?: string;
  /** Narrower content column (goal / ready). Default is wide for connect/plan. */
  narrow?: boolean;
};

export function OnboardingStepFrame({
  children,
  className,
  narrow = false,
}: StepFrameProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "relative z-10 mx-auto flex w-full flex-1 flex-col",
        narrow ? "max-w-2xl" : "max-w-5xl",
        className,
      )}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.32, ease: [0.23, 1, 0.32, 1] }
      }
    >
      {children}
    </motion.div>
  );
}

type StepHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
};

export function OnboardingStepHeader({
  eyebrow,
  title,
  description,
  align = "center",
}: StepHeaderProps) {
  return (
    <header
      className={cn(
        "mb-8 sm:mb-10",
        align === "center" ? "text-center" : "text-left",
      )}
    >
      {eyebrow ? (
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="font-sans text-[clamp(28px,4.5vw,40px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#333C4D] dark:text-foreground">
        {title}
      </h1>
      {description ? (
        <p
          className={cn(
            "mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]",
            align === "center" ? "mx-auto max-w-xl" : "max-w-2xl",
          )}
        >
          {description}
        </p>
      ) : null}
    </header>
  );
}

export function OnboardingDocsLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "absolute right-0 top-0 z-10 rounded-full p-2 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      title="Documentation for this page"
      aria-label="Documentation for this page"
    >
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    </a>
  );
}
