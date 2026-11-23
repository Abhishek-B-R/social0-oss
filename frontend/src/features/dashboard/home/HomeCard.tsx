import type { HTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import Link from "@/components/AppLink";
import { cn } from "@/lib/utils";

/** Plain bordered card used by every Home section. */
export function HomeCard({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("rounded-xl border border-border bg-bg-elevated p-4", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Section title + optional "Calendar →" style link. */
export function CardHeader({
  id,
  title,
  link,
  aside,
}: {
  id: string;
  title: string;
  link?: { href: string; label: string };
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className="text-sm font-semibold text-text">
        {title}
      </h2>
      {aside}
      {link ? (
        <Link
          href={link.href}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {link.label}
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
