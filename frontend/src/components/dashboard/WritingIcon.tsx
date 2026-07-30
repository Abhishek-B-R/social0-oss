import { cn } from "@/lib/utils";

/** Writing / scribble mark used on the Create post CTA. */
export function WritingIcon({
  className,
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  const height = size;
  const width = size * (20.651 / 24.398);
  return (
    <svg
      viewBox="0 0 20.651 24.398"
      className={cn("shrink-0", className)}
      height={height}
      width={width}
      stroke="currentColor"
      fill="none"
      aria-hidden
    >
      <path
        d="M195.33,590c1.035-24.055,19.067-22.739,19.067-22.739"
        transform="translate(-194.549 -566.383)"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <path
        d="M205.069,577.424c10.983.462,9.242-10.18,9.242-10.18"
        transform="translate(-194.549 -566.383)"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <path
        d="M195.991,584.779c15.092,2,14.514-8.1,14.514-8.1"
        transform="translate(-194.549 -566.383)"
        strokeLinecap="round"
        strokeWidth={2}
      />
    </svg>
  );
}
