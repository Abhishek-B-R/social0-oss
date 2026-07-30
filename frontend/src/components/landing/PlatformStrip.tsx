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

export function PlatformStrip() {
  return (
    <div className="border-y border-white/5 bg-[#111111]/80 px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-[#7D7D87]">
          Publishes to
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 opacity-70 sm:gap-x-10">
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className="inline-flex items-center gap-2 text-[13px] font-medium text-[#A1A1AA] transition-colors hover:text-white"
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
