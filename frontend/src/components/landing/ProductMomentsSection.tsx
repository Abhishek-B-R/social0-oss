import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/components/AppLink";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  FolderKanban,
  LayoutGrid,
  PenLine,
  Zap,
} from "lucide-react";
import { FlowAnimation } from "./FlowAnimation";

function hashHref(pathname: string, hash: string) {
  return pathname === "/home" ? `/home${hash}` : `/${hash}`;
}

function VisualShell({
  children,
  flush = false,
}: {
  children: ReactNode;
  /** Edge-to-edge media — no inset frame. */
  flush?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-[0_22px_50px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#1A1A1A] dark:shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:rounded-[28px] ${
        flush ? "p-0" : "p-2 sm:p-2.5"
      }`}
    >
      {children}
    </div>
  );
}

/** Empty frame until you drop light/dark demos in public/videos + posters. */
function MomentVideoPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="flex aspect-video w-full items-center justify-center bg-zinc-100 dark:bg-[#0d0d0d]"
      aria-hidden
    >
      <p className="px-4 text-center text-[13px] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/** Muted loop — pauses when off-screen / tab hidden. Falls back to poster/placeholder. */
function MomentDemoVideoClip({
  src,
  poster,
  placeholderLabel,
  className = "",
}: {
  src: string;
  poster?: string;
  placeholderLabel?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  /** Attach src only after first intersect so moments don't all download at once. */
  const [activated, setActivated] = useState(false);
  const inViewRef = useRef(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || failed) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      el.pause();
      return;
    }

    const sync = () => {
      if (inViewRef.current && !document.hidden) {
        setActivated(true);
        void el.play().catch(() => {});
      } else {
        el.pause();
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        sync();
      },
      { threshold: 0.25, rootMargin: "80px 0px" },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      el.pause();
    };
  }, [failed, src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !activated || failed) return;
    if (inViewRef.current && !document.hidden) {
      void el.play().catch(() => {});
    }
  }, [activated, failed, src]);

  if (failed) {
    if (poster && !posterFailed) {
      return (
        <img
          src={poster}
          alt=""
          className={`w-full bg-zinc-100 object-cover object-bottom dark:bg-[#0d0d0d] ${
            /\brounded/.test(className)
              ? className
              : `rounded-[16px] sm:rounded-[20px] ${className}`
          }`}
          loading="lazy"
          decoding="async"
          onError={() => setPosterFailed(true)}
        />
      );
    }
    return (
      <MomentVideoPlaceholder label={placeholderLabel ?? "Demo coming soon"} />
    );
  }

  return (
    <video
      ref={videoRef}
      className={`w-full bg-zinc-100 object-cover object-bottom dark:bg-[#0d0d0d] ${
        /\brounded/.test(className)
          ? className
          : `rounded-[16px] sm:rounded-[20px] ${className}`
      }`}
      src={activated ? src : undefined}
      poster={poster}
      muted
      playsInline
      loop
      preload="none"
      onError={() => setFailed(true)}
    />
  );
}

/** Theme via CSS — avoids next-themes mount flash + setState-in-effect lint. */
function MomentDemoVideo({
  src,
  darkSrc,
  poster,
  darkPoster,
  placeholderLabel,
  className = "",
}: {
  src: string;
  darkSrc?: string;
  poster?: string;
  darkPoster?: string;
  placeholderLabel?: string;
  className?: string;
}) {
  if (!darkSrc) {
    return (
      <MomentDemoVideoClip
        src={src}
        poster={poster}
        placeholderLabel={placeholderLabel}
        className={className}
      />
    );
  }

  return (
    <>
      <MomentDemoVideoClip
        src={src}
        poster={poster}
        placeholderLabel={placeholderLabel}
        className={`dark:hidden ${className}`}
      />
      <MomentDemoVideoClip
        src={darkSrc}
        poster={darkPoster}
        placeholderLabel={placeholderLabel}
        className={`hidden dark:block ${className}`}
      />
    </>
  );
}

function MomentRow({
  eyebrow,
  Icon,
  title,
  body,
  primary,
  secondary,
  visual,
  flip,
}: {
  eyebrow: string;
  Icon: typeof Zap;
  title: ReactNode;
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  visual: ReactNode;
  flip?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const fade = reduceMotion
    ? { duration: 0 }
    : { duration: 0.55, ease: [0.23, 1, 0.32, 1] as const };

  return (
    <motion.div
      className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10 xl:gap-12"
      initial={reduceMotion ? false : { opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.28, margin: "0px 0px -8% 0px" }}
      transition={fade}
    >
      <div
        className={`flex flex-col gap-3.5 sm:gap-4 ${flip ? "lg:order-2" : "lg:order-1"}`}
      >
        <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
          <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
          {eyebrow}
        </p>
        <h3 className="max-w-xl font-sans text-[clamp(36px,5vw,52px)] font-bold leading-[1.06] tracking-tight text-[#333C4D] dark:text-white">
          {title}
        </h3>
        <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-[17px] sm:leading-[1.55]">
          {body}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-0.5">
          <Link
            href={primary.href}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-[14px] font-semibold text-[#04140c] transition-[transform,background-color] duration-150 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
          >
            {primary.label}
            <span aria-hidden>→</span>
          </Link>
          <Link
            href={secondary.href}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-white/20 dark:bg-transparent dark:text-foreground dark:hover:bg-white/5"
          >
            {secondary.label}
          </Link>
        </div>
      </div>

      <motion.div
        className={`flex items-center ${flip ? "lg:order-1" : "lg:order-2"}`}
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.6, delay: 0.08, ease: [0.23, 1, 0.32, 1] }
        }
      >
        {visual}
      </motion.div>
    </motion.div>
  );
}

/**
 * Product moments — same in normal & agent mode.
 * First visual reuses FlowAnimation; composer + workspaces await demo clips.
 */
export function ProductMomentsSection({
  signedIn = false,
}: {
  signedIn?: boolean;
}) {
  const { pathname } = useLocation();
  const startHref = signedIn ? "/dashboard" : "/auth?mode=signin";
  const composerHref = signedIn ? "/dashboard/composer" : "/auth?mode=signin";
  const workspacesHref = signedIn
    ? "/dashboard/workspaces"
    : "/auth?mode=signin";

  return (
    <section
      id="features"
      className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      aria-label="How Social0 helps you ship"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 sm:gap-14 lg:gap-16">
        <div className="mx-auto mb-0 max-w-3xl text-center">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
            Everything in one place
          </p>
          <h2 className="font-sans text-[clamp(36px,5.5vw,56px)] font-bold leading-[1.08] tracking-tight text-[#333C4D] dark:text-white">
            Everything you need to publish consistently
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
            Publish, schedule, and stay on top of everything you ship — from one
            dashboard, your agents, or the API.
          </p>
        </div>

        <MomentRow
          eyebrow="Publish everywhere"
          Icon={Zap}
          title={
            <>
              One post.{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                Nine platforms.
              </span>
            </>
          }
          body="Create once, select your accounts, and Social0 publishes to them in parallel. No copy-pasting. No tab switching."
          primary={{
            label: signedIn ? "Go to dashboard" : "Publish for free",
            href: startHref,
          }}
          secondary={{
            label: "See all 9 platforms",
            href: hashHref(pathname, "#platforms"),
          }}
          visual={
            <div className="mx-auto w-full max-w-140 lg:ml-auto lg:mr-0 lg:max-w-none">
              <FlowAnimation className="h-full min-h-95 w-full sm:min-h-110 lg:min-h-120" />
            </div>
          }
        />

        <MomentRow
          flip
          eyebrow="Composer-first"
          Icon={PenLine}
          title={
            <>
              A single composer for{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                every post type.
              </span>
            </>
          }
          body="Text, image, video, thread or collection (images + videos) - write it once in the Composer, pick your accounts, and publish or schedule without jumping between forms."
          primary={{
            label: signedIn ? "Open Composer" : "Try Composer free",
            href: composerHref,
          }}
          secondary={{
            label: "Watch the demo",
            href: hashHref(pathname, "#demo"),
          }}
          visual={
            <div className="mx-auto w-full max-w-140 lg:ml-0 lg:mr-auto lg:max-w-none">
              <VisualShell flush>
                <MomentDemoVideo
                  src="/videos/composer-light.mp4"
                  darkSrc="/videos/composer-dark.mp4"
                  poster="/demos/composer-light-preview.png"
                  darkPoster="/demos/composer-dark-preview.png"
                  placeholderLabel="Composer demo — drop videos here later"
                  className="rounded-none"
                />
              </VisualShell>
            </div>
          }
        />

        <MomentRow
          eyebrow="Plan ahead"
          Icon={CalendarDays}
          title={
            <>
              Schedule it.{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                Post on time.
              </span>
            </>
          }
          body="Select accounts, customize captions per platform, and pick a time. Schedule your posts, reposts, and autoplugs — change anything before it publishes."
          primary={{
            label: signedIn ? "Open calendar" : "Try scheduling free",
            href: signedIn ? "/dashboard/calendar" : "/auth?mode=signin",
          }}
          secondary={{
            label: "Watch the demo",
            href: hashHref(pathname, "#demo"),
          }}
          visual={
            <div className="mx-auto w-full max-w-140 lg:ml-auto lg:mr-0 lg:max-w-none">
              <VisualShell flush>
                <MomentDemoVideo
                  src="/videos/schedule-effortlessly-light.mp4"
                  darkSrc="/videos/schedule-effortlessly-dark.mp4"
                  poster="/demos/schedule-effortlessly-light-preview.png"
                  darkPoster="/demos/schedule-effortlessly-dark-preview.png"
                  className="rounded-none"
                />
              </VisualShell>
            </div>
          }
        />

        <MomentRow
          flip
          eyebrow="Stay in control"
          Icon={LayoutGrid}
          title={
            <>
              Everything you posted.{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                One calendar.
              </span>
            </>
          }
          body="Drafts, queued, and live posts across all accounts in a single view. See what landed where — fix a caption or cancel a slot without bouncing between apps."
          primary={{
            label: signedIn ? "Go to posts" : "Start free",
            href: signedIn ? "/dashboard/posts" : "/auth?mode=signin",
          }}
          secondary={{
            label: "Compare plans",
            href: "/pricing",
          }}
          visual={
            <div className="mx-auto w-full max-w-140 lg:ml-0 lg:mr-auto lg:max-w-none">
              <VisualShell flush>
                <MomentDemoVideo
                  src="/videos/calendar-control-light.mp4"
                  darkSrc="/videos/calendar-control-dark.mp4"
                  poster="/demos/calendar-control-light-preview.png"
                  darkPoster="/demos/calendar-control-dark-preview.png"
                  className="rounded-none"
                />
              </VisualShell>
            </div>
          }
        />

        <MomentRow
          eyebrow="Multiple workspaces"
          Icon={FolderKanban}
          title={
            <>
              Separate workspaces for{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                every brand.
              </span>
            </>
          }
          body="Give each brand or niche its own workspace — accounts, posts, and schedules stay cleanly separated so you never mix client content with personal."
          primary={{
            label: signedIn ? "Open workspaces" : "Start free",
            href: workspacesHref,
          }}
          secondary={{
            label: "Compare plans",
            href: "/pricing",
          }}
          visual={
            <div className="mx-auto w-full max-w-140 lg:ml-auto lg:mr-0 lg:max-w-none">
              <VisualShell flush>
                <MomentDemoVideo
                  src="/videos/workspaces-light.mp4"
                  darkSrc="/videos/workspaces-dark.mp4"
                  poster="/demos/workspaces-light-preview.png"
                  darkPoster="/demos/workspaces-dark-preview.png"
                  placeholderLabel="Workspaces demo — drop videos here later"
                  className="rounded-none"
                />
              </VisualShell>
            </div>
          }
        />
      </div>
    </section>
  );
}
