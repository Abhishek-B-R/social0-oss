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

const platforms = [
  {
    name: "Twitter / X",
    type: "Text · Images · Videos · Threads",
    icon: XIcon,
    iconBg: "#000000",
    darkIconBg: "#ffffff",
  },
  {
    name: "Instagram",
    type: "Images · Reels · Carousels",
    icon: InstagramIcon,
    iconBg: "#E1306C",
    darkIconBg: "#E1306C",
  },
  {
    name: "LinkedIn",
    type: "Text · Images · Videos",
    icon: LinkedInIcon,
    iconBg: "#0077B5",
    darkIconBg: "#0077B5",
  },
  {
    name: "YouTube",
    type: "Videos · Shorts",
    icon: YouTubeIcon,
    iconBg: "#FF0000",
    darkIconBg: "#FF0000",
  },
  {
    name: "TikTok",
    type: "Short Videos · Photo posts",
    icon: TikTokIcon,
    iconBg: "#010101",
    darkIconBg: "#ffffff",
  },
  {
    name: "Facebook",
    type: "Text · Images · Videos",
    icon: FacebookIcon,
    iconBg: "#1877F2",
    darkIconBg: "#1877F2",
  },
  {
    name: "Threads",
    type: "Text · Images · Videos · Threads",
    icon: ThreadsIcon,
    iconBg: "#000000",
    darkIconBg: "#ffffff",
  },
  {
    name: "Bluesky",
    type: "Text · Images · Videos · Threads",
    icon: BlueskyIcon,
    iconBg: "#0560FF",
    darkIconBg: "#0560FF",
  },
  {
    name: "Pinterest",
    type: "Pins · Videos",
    icon: PinterestIcon,
    iconBg: "#E60023",
    darkIconBg: "#E60023",
  },
] as const;

function isLightTile(bg: string) {
  return bg === "#ffffff" || bg === "#FFFFFF";
}

export function SupportedPlatforms() {
  return (
    <section
      id="platforms"
      className="bg-foreground py-16 text-background sm:py-20 dark:bg-[#0A0A0A] dark:text-white lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <div className="mb-14">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-widest text-background/55 dark:text-white/55">
            Supported platforms
          </div>
          <h2 className="font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-background dark:text-white">
            9 platforms.
            <br />
            More coming.
          </h2>
          <p className="mt-2 max-w-[360px] text-[14px] leading-relaxed text-background/70 dark:text-white/70">
            Publish everywhere your audience already is.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {platforms.map((p) => {
            const darkFg = isLightTile(p.darkIconBg) ? "#0A0A0A" : "#ffffff";
            return (
              <div
                key={p.name}
                className="group cursor-default rounded-xl border border-background/8 bg-background/4 p-6 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-background/20 hover:bg-background/[0.07] dark:border-white/8 dark:bg-white/4 dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
              >
                {/* Light tile */}
                <div
                  className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 dark:hidden"
                  style={{ background: p.iconBg }}
                >
                  <p.icon className="h-5 w-5 text-white" />
                </div>
                {/* Dark tile — use darkIconBg so X/TikTok/Threads stay visible */}
                <div
                  className="mb-3 hidden h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 dark:flex"
                  style={{ background: p.darkIconBg }}
                >
                  <p.icon className="h-5 w-5" style={{ color: darkFg }} />
                </div>
                <div className="text-[14px] font-medium text-background/85 dark:text-white/85">
                  {p.name}
                </div>
                <div className="mt-0.5 text-[12px] text-background/55 transition-colors duration-200 group-hover:text-background/80 dark:text-white/55 dark:group-hover:text-white/80">
                  {p.type}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
