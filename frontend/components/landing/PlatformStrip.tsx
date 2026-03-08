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
  { name: "Twitter / X", icon: XIcon },
  { name: "Instagram", icon: InstagramIcon },
  { name: "LinkedIn", icon: LinkedInIcon },
  { name: "YouTube", icon: YouTubeIcon },
  { name: "TikTok", icon: TikTokIcon },
  { name: "Facebook", icon: FacebookIcon },
  { name: "Threads", icon: ThreadsIcon },
  { name: "Bluesky", icon: BlueskyIcon },
  { name: "Pinterest", icon: PinterestIcon },
];

export function PlatformStrip() {
  return (
    <div className="border-y border-border bg-muted/50 px-6 py-5 dark:bg-muted/30 lg:px-8">
      <div className="mx-auto max-w-[1100px] flex-wrap items-center gap-3">
        <div className="mr-2 shrink-0 text-[11px] font-medium uppercase tracking-widest text-muted-foreground text-center mb-4">
          Publishes to
        </div>
        <span className="flex flex-wrap items-center gap-3">
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground dark:bg-background/50"
            >
              <p.icon className="h-3.5 w-3.5" />
              {p.name}
            </div>
          ))}
        </span>
      </div>
    </div>
  );
}
