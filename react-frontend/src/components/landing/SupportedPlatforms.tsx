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
];

export function SupportedPlatforms() {
  return (
    <section
      id="platforms"
      className="bg-foreground py-24 text-background dark:bg-[#0A0A0A] dark:text-white"
    >
      <div className="mx-auto max-w-[1100px] px-6 lg:px-8">
        {/* Header row */}
        <div className="mb-14">
          <div className="mb-3 text-[11px] uppercase tracking-widest text-background/30 dark:text-white/30">
            Supported platforms
          </div>
          <h2 className="font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-background dark:text-white">
            9 platforms.
            <br />
            More coming.
          </h2>
          <p className="mt-2 max-w-[360px] text-[14px] leading-relaxed text-background/40 dark:text-white/40">
            Publish everywhere your audience already is.
          </p>
        </div>

        {/* 3-column platform grid */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {platforms.map((p) => (
            <div
              key={p.name}
              className="group cursor-pointer rounded-xl border border-background/8 bg-background/4 p-6 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-background/20 hover:shadow-lg hover:bg-background/[0.07] dark:border-white/8 dark:bg-white/4 dark:hover:border-white/20 dark:hover:bg-white/[0.07] dark:hover:shadow-lg dark:hover:shadow-black/20"
            >
              <div
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 group-hover:brightness-110"
                style={{ background: p.iconBg }}
              >
                <p.icon
                  className="h-5 w-5 text-white"
                  style={{
                    color:
                      p.iconBg === "#000000" || p.iconBg === "#010101"
                        ? "#fff"
                        : "#fff",
                  }}
                />
              </div>
              <div className="text-[14px] font-medium text-background/85 dark:text-white/85">
                {p.name}
              </div>
              <div className="mt-0.5 text-[12px] text-background/30 transition-colors duration-200 group-hover:text-background/70 dark:text-white/30 dark:group-hover:text-white/70">
                {p.type}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
