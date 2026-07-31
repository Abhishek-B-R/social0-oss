import {
  XIcon,
  InstagramIcon,
  LinkedInIcon,
  YouTubeIcon,
  TikTokIcon,
  FacebookIcon,
  ThreadsIcon,
  BlueskyIcon,
  PinterestIcon,
} from "./PlatformIcons";

const PLATFORMS = [
  { name: "X", icon: XIcon },
  { name: "Instagram", icon: InstagramIcon },
  { name: "LinkedIn", icon: LinkedInIcon },
  { name: "YouTube", icon: YouTubeIcon },
  { name: "TikTok", icon: TikTokIcon },
  { name: "Facebook", icon: FacebookIcon },
  { name: "Threads", icon: ThreadsIcon },
  { name: "Bluesky", icon: BlueskyIcon },
  { name: "Pinterest", icon: PinterestIcon },
];

export function PlatformStrip({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center border-y border-border bg-muted px-4 dark:bg-[#111111] sm:px-6 lg:px-8 ${
        compact ? "py-3 sm:py-3.5" : "py-6 sm:py-7"
      }`}
    >
      <div className="mx-auto w-full max-w-[1440px] sm:w-[92%] lg:w-[90%]">
        <div
          className={`text-center text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground sm:text-[11px] ${
            compact ? "mb-2.5" : "mb-4"
          }`}
        >
          Publishes to
        </div>
        <div
          className={`flex flex-wrap items-center justify-center opacity-90 ${
            compact
              ? "gap-x-5 gap-y-2.5 sm:gap-x-8"
              : "gap-x-8 gap-y-4 sm:gap-x-10"
          }`}
        >
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              title={p.name}
            >
              <p.icon className={compact ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4 w-4"} />
              <span className="hidden sm:inline">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
