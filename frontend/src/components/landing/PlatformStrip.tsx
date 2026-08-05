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

export function PlatformStrip({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center border-y border-border bg-muted px-4 dark:bg-[#111111] sm:px-6 lg:px-8 ${
        compact ? "py-3 sm:py-3.5" : "py-6 sm:py-7"
      } ${className}`}
    >
      <div className="mx-auto w-full min-w-0 max-w-[1440px] sm:w-[92%] lg:w-[90%]">
        <div
          className={`text-center text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground sm:text-[11px] ${
            compact ? "mb-2.5" : "mb-4"
          }`}
        >
          Publishes to
        </div>
        {/*
          ponytail: justify-start below lg — centered nowrap rows clip both edges when wider than the viewport
        */}
        <div
          className={`flex min-w-0 flex-nowrap items-center justify-center gap-x-5 overflow-x-auto opacity-90 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-x-6 lg:gap-x-8 [&::-webkit-scrollbar]:hidden ${
            compact ? "" : "gap-x-6 sm:gap-x-8 lg:gap-x-10"
          }`}
        >
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className="inline-flex shrink-0 items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              title={p.name}
            >
              <p.icon className="h-4 w-4" />
              <span className="hidden lg:inline">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
