const YOUTUBE_DEMO_ID = "fSTVYFd5DXU";

/**
 * Product demo embed under the hero.
 */
export function DemoVideoSection() {
  return (
    <section
      className="px-4 pb-16 pt-2 sm:px-6 sm:pb-20 sm:pt-4 lg:px-8"
      aria-label="Social0 product demo video"
      id="demo"
    >
      <div className="mx-auto max-w-280">
        <div className="overflow-hidden rounded-[28px] border border-border bg-muted/40 p-1.5 shadow-[0_40px_80px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#1A1A1A] dark:shadow-[0_40px_80px_rgba(0,0,0,0.4)]">
          <div className="overflow-hidden rounded-[22px] border border-border/60 bg-background dark:border-white/5 dark:bg-[#111111]">
            <div className="relative aspect-video w-full overflow-hidden">
              {/* ponytail: YouTube no longer allows hiding the title bar — crop it */}
              <iframe
                src={`https://www.youtube.com/embed/${YOUTUBE_DEMO_ID}?rel=0&modestbranding=1&iv_load_policy=3`}
                title="Social0 demo - post and schedule to all your socials from one place"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="absolute top-0 left-0 h-[calc(100%+60px)] w-full -translate-y-15 border-0"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
