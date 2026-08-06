import { XIcon } from "./PlatformIcons";

/** Official brand marks — served locally under /icons. */
const PLATFORMS = [
  { name: "Twitter / X", src: "/icons/x.svg" },
  { name: "Instagram", src: "/icons/instagram.svg" },
  { name: "LinkedIn", src: "/icons/linkedin.svg" },
  { name: "YouTube", src: "/icons/youtube.svg" },
  {
    name: "TikTok",
    // ponytail: black glyph is edge-cropped; scale down to match padded dark tile
    src: "/icons/tiktok-black.png",
    darkSrc: "/icons/tiktok.png",
    srcScale: 0.7,
  },
  { name: "Facebook", src: "/icons/facebook.svg" },
  {
    name: "Threads",
    src: "/icons/threads-black.png",
    darkSrc: "/icons/threads-white.png",
  },
  { name: "Bluesky", src: "/icons/bluesky.svg" },
  {
    name: "Pinterest",
    // ponytail: red disc sits inset in the PNG — scale up to match peer icon weight
    src: "/icons/pinterest.png",
    srcScale: 1.2,
  },
] as const;

function isTwitterMark(name: string, src?: string) {
  const n = name.toLowerCase();
  return (
    n === "x" || n.includes("twitter") || Boolean(src?.includes("/icons/x."))
  );
}

/**
 * Platforms-section Twitter mark: black X on white tile in light,
 * white X on black tile in dark.
 */
export function TwitterXBrandIcon({
  size = 22,
  responsive = false,
  className = "",
}: {
  size?: number;
  responsive?: boolean;
  className?: string;
}) {
  return (
    <span
      className={
        responsive
          ? `inline-flex size-7 shrink-0 items-center justify-center rounded-[22%] bg-white sm:size-9 md:size-10 dark:bg-black ${className}`
          : `inline-flex shrink-0 items-center justify-center rounded-[22%] bg-white dark:bg-black ${className}`
      }
      style={responsive ? undefined : { width: size, height: size }}
      title="Twitter / X"
    >
      <XIcon
        aria-hidden
        className={
          responsive
            ? "size-[55%] text-black dark:text-white"
            : "text-black dark:text-white"
        }
        style={
          responsive
            ? undefined
            : {
                width: Math.round(size * 0.55),
                height: Math.round(size * 0.55),
              }
        }
      />
      <span className="sr-only">Twitter / X</span>
    </span>
  );
}

export function PlatformBrandIcon({
  name,
  src,
  darkSrc,
  srcScale = 1,
  size = 22,
  responsive = false,
}: {
  name: string;
  src: string;
  darkSrc?: string;
  srcScale?: number;
  size?: number;
  /** Hero: size-7 → sm:size-9 → md:size-10 so 9 icons fit one mobile row */
  responsive?: boolean;
}) {
  if (isTwitterMark(name, src)) {
    return <TwitterXBrandIcon size={size} responsive={responsive} />;
  }

  const lightPct = `${Math.round(srcScale * 100)}%`;

  return (
    <span
      className={
        responsive
          ? "relative inline-flex size-7 shrink-0 items-center justify-center sm:size-9 md:size-10"
          : "relative inline-flex shrink-0 items-center justify-center"
      }
      style={responsive ? undefined : { width: size, height: size }}
      title={name}
    >
      <img
        src={src}
        alt=""
        width={responsive ? 40 : Math.round(size * srcScale)}
        height={responsive ? 40 : Math.round(size * srcScale)}
        className={`object-contain ${darkSrc ? "dark:hidden" : ""} ${
          responsive && srcScale === 1 ? "size-full" : ""
        }`}
        style={
          srcScale !== 1 || !responsive
            ? {
                width: responsive ? lightPct : Math.round(size * srcScale),
                height: responsive ? lightPct : Math.round(size * srcScale),
              }
            : undefined
        }
        loading="lazy"
        decoding="async"
      />
      {darkSrc ? (
        <img
          src={darkSrc}
          alt=""
          width={responsive ? 40 : size}
          height={responsive ? 40 : size}
          className="hidden size-full object-contain dark:block"
          style={responsive ? undefined : { width: size, height: size }}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function PlatformStrip({
  compact = false,
  variant = "bar",
  className = "",
}: {
  compact?: boolean;
  /** `hero` = centered icon row (no bar chrome). `bar` = full-width publishes-to strip. */
  variant?: "bar" | "hero";
  className?: string;
}) {
  if (variant === "hero") {
    return (
      <div
        className={`flex w-full flex-col items-center ${className}`}
        aria-label="Publishes to"
      >
        <div className="flex w-full max-w-full flex-nowrap items-center justify-center gap-x-1.5 sm:gap-x-2.5 md:gap-x-3">
          {PLATFORMS.map((p) => (
            <PlatformBrandIcon
              key={p.name}
              name={p.name}
              src={p.src}
              darkSrc={"darkSrc" in p ? p.darkSrc : undefined}
              srcScale={"srcScale" in p ? p.srcScale : 1}
              responsive
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center border-y border-border bg-muted px-4 dark:bg-[#111111] sm:px-6 lg:px-8 ${
        compact ? "py-3 sm:py-3.5" : "py-6 sm:py-7"
      } ${className}`}
    >
      <div className="mx-auto w-full min-w-0 max-w-360 sm:w-[92%] lg:w-[90%]">
        <div
          className={`text-center text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground sm:text-[11px] ${
            compact ? "mb-2.5" : "mb-4"
          }`}
        >
          Publishes to
        </div>
        <div
          className={`flex min-w-0 flex-nowrap items-center justify-center gap-x-5 overflow-x-auto opacity-90 [-ms-overflow-style:none] scrollbar-none sm:gap-x-6 lg:gap-x-8 [&::-webkit-scrollbar]:hidden ${
            compact ? "" : "gap-x-6 sm:gap-x-8 lg:gap-x-10"
          }`}
        >
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className="inline-flex shrink-0 items-center gap-2 text-[13px] font-medium text-muted-foreground"
              title={p.name}
            >
              <PlatformBrandIcon
                name={p.name}
                src={p.src}
                darkSrc={"darkSrc" in p ? p.darkSrc : undefined}
                srcScale={"srcScale" in p ? p.srcScale : 1}
                size={16}
              />
              <span className="hidden lg:inline">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
