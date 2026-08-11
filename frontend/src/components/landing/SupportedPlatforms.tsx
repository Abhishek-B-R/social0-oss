import { PlatformBrandIcon } from "./PlatformStrip";

/** Same /icons assets as the hero PlatformStrip. */
const platforms = [
  {
    name: "Twitter / X",
    type: "Text · Images · Videos · Threads",
    src: "/icons/x.svg",
  },
  {
    name: "Instagram",
    type: "Images · Reels · Carousels",
    src: "/icons/instagram.svg",
  },
  {
    name: "LinkedIn",
    type: "Text · Images · Videos",
    src: "/icons/linkedin.svg",
  },
  {
    name: "YouTube",
    type: "Videos · Shorts",
    src: "/icons/youtube.svg",
  },
  {
    name: "TikTok",
    type: "Short Videos · Photo posts",
    src: "/icons/tiktok-black.png",
    darkSrc: "/icons/tiktok.png",
    srcScale: 0.7,
  },
  {
    name: "Facebook",
    type: "Text · Images · Videos",
    src: "/icons/facebook.svg",
  },
  {
    name: "Threads",
    type: "Text · Images · Videos · Threads",
    src: "/icons/threads-black.png",
    darkSrc: "/icons/threads-white.png",
  },
  {
    name: "Bluesky",
    type: "Text · Images · Videos · Threads",
    src: "/icons/bluesky.svg",
  },
  {
    name: "Pinterest",
    type: "Pins · Videos",
    src: "/icons/pinterest.png",
    srcScale: 1.2,
  },
] as const;

export function SupportedPlatforms() {
  return (
    <section
      id="platforms"
      className="border-y border-zinc-200/80 bg-[#f7f7f8] py-16 text-foreground sm:py-20 dark:border-white/8 dark:bg-[#0A0A0A] dark:text-white lg:py-24"
    >
      <div className="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <div className="mb-14">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Supported platforms
          </div>
          <h2 className="font-sans text-[clamp(28px,4vw,44px)] font-bold leading-tight tracking-tight text-[#333C4D] dark:text-white">
            9 platforms.
            <br />
            More coming.
          </h2>
          <p className="mt-2 max-w-[360px] text-[14px] leading-relaxed text-muted-foreground">
            Publish everywhere your audience already is.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {platforms.map((p) => (
            <div
              key={p.name}
              className="group cursor-default rounded-xl border border-zinc-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-zinc-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] dark:border-white/8 dark:bg-white/4 dark:shadow-none dark:hover:border-white/20 dark:hover:bg-white/[0.07]"
            >
              <div className="mb-3 flex size-9 items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <PlatformBrandIcon
                  name={p.name}
                  src={p.src}
                  darkSrc={"darkSrc" in p ? p.darkSrc : undefined}
                  srcScale={"srcScale" in p ? p.srcScale : 1}
                  size={36}
                />
              </div>
              <div className="text-[14px] font-medium text-foreground dark:text-white/85">
                {p.name}
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground transition-colors duration-200 group-hover:text-foreground/80 dark:text-white/55 dark:group-hover:text-white/80">
                {p.type}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
