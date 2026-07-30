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
      className={`border-y border-border bg-muted/50 px-4 dark:bg-[#111111]/80 sm:px-6 lg:px-8 ${
        compact ? "py-4 sm:py-5" : "py-6 sm:py-7"
      }`}
    >
      <div className="mx-auto max-w-[1100px]">
        <div
          className={`text-center text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground ${
            compact ? "mb-3" : "mb-4"
          }`}
        >
          Publishes to
        </div>
        <div
          className={`flex flex-wrap items-center justify-center opacity-85 ${
            compact
              ? "gap-x-5 gap-y-3 sm:gap-x-7"
              : "gap-x-8 gap-y-4 sm:gap-x-10"
          }`}
        >
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              title={p.name}
            >
              <p.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
