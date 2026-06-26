const YOUTUBE_DEMO_ID = "C0mspHvKg_o";

export function DemoVideoSection() {
  return (
    <section
      className="px-6 pb-24 lg:px-8"
      aria-label="Social0 product demo video"
    >
      <div className="mx-auto mt-16 max-w-[1100px]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_80px_rgba(0,0,0,0.12)] dark:shadow-[0_40px_80px_rgba(0,0,0,0.4)]">
          <div className="relative aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${YOUTUBE_DEMO_ID}`}
              title="Social0 demo - post and schedule to all your socials from one place"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
