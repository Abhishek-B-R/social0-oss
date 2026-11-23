import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, Copy, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import { cn } from "@/lib/utils";
import { focusRing } from "./onboarding-styles";

/* Layout */

export function OnboardingStepFrame({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  /** Wider column for the network grid. */
  wide?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "relative z-10 mx-auto flex w-full flex-1 flex-col",
        wide ? "max-w-4xl" : "max-w-2xl",
        className,
      )}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.28, ease: [0.23, 1, 0.32, 1] }
      }
    >
      {children}
    </motion.div>
  );
}

export function OnboardingStepHeader({
  step,
  title,
  description,
  docsHref,
  back,
}: {
  step: 1 | 2 | 3;
  title: ReactNode;
  description?: ReactNode;
  docsHref?: string;
  /** Path of the previous step; renders a Back link. */
  back?: string;
}) {
  return (
    <header className="mb-7 sm:mb-8">
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {back ? (
            <Link
              href={back}
              className={cn(
                "-ml-2 inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                focusRing,
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </Link>
          ) : null}
          <p className="text-[12px] font-medium text-muted-foreground">
            Step {step} of 3
          </p>
        </div>
        {docsHref ? <OnboardingDocsLink href={docsHref} /> : null}
      </div>
      <h1 className="font-sans text-[clamp(26px,4vw,34px)] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
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
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        focusRing,
        className,
      )}
      title="Help for this step (opens in a new tab)"
      aria-label="Help for this step (opens in a new tab)"
    >
      <Info className="h-4 w-4" aria-hidden />
    </a>
  );
}

/** Centered spinner with one line of copy (checkout verify, finishing). */
export function OnboardingBusy({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-24"
      role="status"
      aria-live="polite"
    >
      <Loader2
        className="h-7 w-7 animate-spin text-accent motion-reduce:animate-none"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/* Choice cards (goal, post mode). Rendered inside a role="radiogroup". */

export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  children,
  tone = "default",
  tabIndex,
  onKeyDown,
  cardRef,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Extra content shown under the card body when selected. */
  children?: ReactNode;
  tone?: "default" | "agent";
  tabIndex?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  cardRef?: (node: HTMLButtonElement | null) => void;
}) {
  const selectedClass =
    tone === "agent"
      ? "border-agent bg-agent-soft ring-1 ring-agent"
      : "border-accent bg-accent/[0.07] ring-1 ring-accent";
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card/80 transition-[border-color,background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        selected ? selectedClass : "border-border hover:border-foreground/25",
      )}
    >
      <button
        ref={cardRef}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={tabIndex}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-start gap-3 rounded-2xl px-4 py-3.5 text-left",
          focusRing,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
            selected
              ? tone === "agent"
                ? "border-agent bg-agent text-background"
                : "border-accent bg-accent text-accent-foreground"
              : "border-border bg-background",
          )}
        >
          {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {icon ? (
              <span className="shrink-0 text-muted-foreground" aria-hidden>
                {icon}
              </span>
            ) : null}
            <span className="font-semibold text-foreground">{title}</span>
          </span>
          {description ? (
            <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </button>
      {selected && children ? (
        <div className="px-4 pb-4 sm:pl-[46px]">{children}</div>
      ) : null}
    </div>
  );
}

/* Copy field */

export function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Copied ${label}`);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-foreground">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12.5px] leading-5 text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label}`}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted",
            focusRing,
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-ok" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {hint ? (
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
