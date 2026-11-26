import { COVER_CHIPS, COVER_TINTS } from "@/lib/content/blog-covers";
import type { BlogPost } from "@/lib/content/blog-types";
import { cn } from "@/lib/utils";

/** Generated cover: category-tinted panel with the post's key facts as chips. Decorative, so aria-hidden. */
export function BlogCover({ post, size = "lg", className }: { post: Pick<BlogPost, "slug" | "category">; size?: "sm" | "lg"; className?: string }) {
  const [a, b] = COVER_TINTS[post.category];
  const chips = COVER_CHIPS[post.slug] ?? [post.category];
  return (
    <div
      aria-hidden
      className={cn("relative flex items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/40", size === "lg" ? "aspect-[1.91/1]" : "aspect-[1.6/1]", className)}
      style={{
        backgroundImage: `radial-gradient(circle at 18% 28%, ${a}40, transparent 48%), radial-gradient(circle at 82% 72%, ${b}40, transparent 48%), linear-gradient(to right, color-mix(in srgb, currentColor 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, currentColor 6%, transparent) 1px, transparent 1px)`,
        backgroundSize: "auto, auto, 32px 32px, 32px 32px",
      }}
    >
      <div className={cn("flex max-w-[85%] flex-wrap justify-center", size === "lg" ? "gap-3" : "gap-2")}>
        {chips.map((c) => (
          <span
            key={c}
            className={cn("rounded-full border border-border bg-background/90 font-semibold tracking-tight text-foreground shadow-sm",
              size === "lg" ? "px-4 py-2 text-[clamp(14px,2vw,20px)]" : "px-3 py-1.5 text-[13px]")}
          >
            {c}
          </span>
        ))}
      </div>
      <span className={cn("absolute bottom-3 left-4 font-logo text-foreground/70", size === "lg" ? "text-[18px]" : "text-[14px]")}>Social0</span>
    </div>
  );
}
