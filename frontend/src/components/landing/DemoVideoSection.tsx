import { useState } from "react";

const YOUTUBE_DEMO_ID = "yGADZAGW7ls";
const THUMB = `https://i.ytimg.com/vi/${YOUTUBE_DEMO_ID}/hqdefault.jpg`;

export function DemoVideoSection() {
  const [playing, setPlaying] = useState(false);

  return (
    <section
      className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8"
      aria-label="Social0 product demo video"
    >
      <div className="mx-auto mt-8 max-w-[1100px] sm:mt-16">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_80px_rgba(0,0,0,0.12)] dark:shadow-[0_40px_80px_rgba(0,0,0,0.4)]">
          <div className="relative aspect-video w-full">
            {playing ? (
              <iframe
                src={`https://www.youtube.com/embed/${YOUTUBE_DEMO_ID}?autoplay=1`}
                title="Social0 demo - post and schedule to all your socials from one place"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="group absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden bg-muted"
                aria-label="Play Social0 demo video"
              >
                <img
                  src={THUMB}
                  alt=""
                  width={480}
                  height={360}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <span className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-foreground/90 text-background shadow-lg transition-transform duration-200 group-hover:scale-105 dark:bg-white/90 dark:text-[#0a0a0a]">
                  <svg
                    viewBox="0 0 24 24"
                    className="ml-0.5 h-7 w-7 fill-current"
                    aria-hidden="true"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
