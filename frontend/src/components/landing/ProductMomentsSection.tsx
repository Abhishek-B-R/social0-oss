import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import Link from "@/components/AppLink";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, LayoutGrid, Zap } from "lucide-react";
import { FlowAnimation } from "./FlowAnimation";
import { WfCalendar } from "./wireframes/ProductWireframes";
import { WireframeStage } from "./wireframes/WireframeStage";

function hashHref(pathname: string, hash: string) {
  return pathname === "/home" ? `/home${hash}` : `/${hash}`;
}

function VisualShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-zinc-200 bg-white p-2 shadow-[0_22px_50px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#1A1A1A] dark:shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:rounded-[28px] sm:p-2.5">
      {children}
    </div>
  );
}

/** Muted loop — pauses when off-screen / tab hidden. Theme-aware src when darkSrc set. */
function MomentDemoVideo({
  src,
  darkSrc,
  poster,
  darkPoster,
  className = "",
}: {
  src: string;
  darkSrc?: string;
  poster?: string;
  darkPoster?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const activeSrc = isDark && darkSrc ? darkSrc : src;
  const activePoster = isDark && darkPoster ? darkPoster : poster;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let inView = false;
    const sync = () => {
      if (inView && !document.hidden) void el.play().catch(() => {});
      else el.pause();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        sync();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      el.pause();
    };
  }, [activeSrc]);

  return (
    <video
      key={activeSrc}
      ref={videoRef}
      className={`w-full rounded-[16px] bg-zinc-100 object-cover object-bottom dark:bg-[#0d0d0d] sm:rounded-[20px] ${className}`}
      src={activeSrc}
      poster={activePoster}
      muted
      playsInline
      loop
      preload="metadata"
    />
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
        <h3 className="max-w-xl font-sans text-[clamp(36px,5vw,52px)] font-bold leading-[1.06] tracking-tight text-foreground dark:text-white">
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
 * Three product moments — same in normal & agent mode.
 * First visual reuses FlowAnimation (theme-aware publish diagram).
 */
export function ProductMomentsSection({
  signedIn = false,
}: {
  signedIn?: boolean;
}) {
  const { pathname } = useLocation();
  const startHref = signedIn ? "/dashboard" : "/auth?mode=signup";

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
          <h2 className="font-sans text-[clamp(36px,5.5vw,56px)] font-bold leading-[1.08] tracking-tight text-foreground dark:text-white">
            Everything you need to grow on social medias effortlessly
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
            Publish, schedule, and stay on top of what shipped — dashboard,
            agents, and API included.
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
          body="Hit publish once — Social0 fans out in parallel. Threads, carousels, and single posts ship the same way. You or your agents, same encrypted pipeline — one network failing doesn’t stall the rest."
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
          eyebrow="Plan ahead"
          Icon={CalendarDays}
          title={
            <>
              Queue it.{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                Ship on time.
              </span>
            </>
          }
          body="Choose accounts, tune captions per platform, set the slot. Queue evergreen reposts and auto-plug winners — edit or move anything before it goes live."
          primary={{
            label: signedIn ? "Open calendar" : "Try scheduling free",
            href: signedIn ? "/dashboard/calendar" : "/auth?mode=signup",
          }}
          secondary={{
            label: "Watch the demo",
            href: hashHref(pathname, "#demo"),
          }}
          visual={
            <div className="mx-auto w-full max-w-140 lg:ml-0 lg:mr-auto lg:max-w-none">
              <VisualShell>
                <MomentDemoVideo
                  src="/videos/schedule-effortlessly-light.mp4"
                  darkSrc="/videos/schedule-effortlessly-dark.mp4"
                  poster="/demos/schedule-effortlessly-light-preview.png"
                  darkPoster="/demos/schedule-effortlessly-dark-preview.png"
                />
              </VisualShell>
            </div>
          }
        />

        <MomentRow
          eyebrow="Stay in control"
          Icon={LayoutGrid}
          title={
            <>
              Everything you shipped.{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                One calendar.
              </span>
            </>
          }
          body="Drafts, queued, and live posts across all accounts in a single view. See what landed where — fix a caption or cancel a slot without bouncing between apps."
          primary={{
            label: signedIn ? "Go to posts" : "Start free",
            href: signedIn ? "/dashboard/posts" : "/auth?mode=signup",
          }}
          secondary={{
            label: "Compare plans",
            href: "/pricing",
          }}
          visual={
            <VisualShell>
              <WireframeStage
                className="min-h-85 border-0 sm:min-h-100 lg:min-h-110"
                tall
                wide
              >
                <WfCalendar className="h-75 w-full sm:h-90 lg:h-100" />
              </WireframeStage>
            </VisualShell>
          }
        />
      </div>
    </section>
  );
}
