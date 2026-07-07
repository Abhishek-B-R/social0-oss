import { Code, Video, Megaphone } from "lucide-react";

const personas = [
  {
    title: "Indie Builders",
    description:
      "Building in public? Ship updates to Twitter, Bluesky, and Threads without the tab dance.",
    icon: Code,
  },
  {
    title: "Content Creators",
    description:
      "One post, nine platforms. Share images and videos without copying between apps all day.",
    icon: Video,
  },
  {
    title: "Solo Marketers",
    description:
      "Run your company’s social media without hiring a team or an agency.",
    icon: Megaphone,
  },
];

export function WhoIsItFor() {
  return (
    <section className="px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        {/* Section header */}
        <div className="mb-14">
          <div className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground">
            Who is it for
          </div>
          <h2 className="max-w-md font-serif text-[clamp(28px,4vw,44px)] leading-tight tracking-tight text-foreground">
            Who is Social0 for?
          </h2>
        </div>

        {/* 3-column grid */}
        <div className="grid gap-px overflow-hidden rounded-2xl bg-border md:grid-cols-3">
          {personas.map((persona) => (
            <div
              key={persona.title}
              className="flex flex-col bg-background p-10 transition-colors hover:bg-muted/40 dark:hover:bg-muted/20 md:p-12"
            >
              {/* Persona icon at top */}
              <div className="mb-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted/50 dark:bg-muted/30">
                  <persona.icon
                    className="h-7 w-7 text-foreground"
                    strokeWidth={1.5}
                  />
                </div>
              </div>
              <h3 className="mb-4 font-serif text-2xl tracking-tight text-foreground">
                {persona.title}
              </h3>
              <p className="flex-1 text-[15px] leading-relaxed text-muted-foreground">
                {persona.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
