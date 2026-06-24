import Link from "next/link";

export function PseoRelatedLinks({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  if (links.length === 0) return null;

  return (
    <section className="border-t border-border bg-muted/30 px-6 py-12 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <h2 className="mb-4 text-[11px] uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <ul className="flex flex-wrap gap-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex rounded-full border border-border bg-background px-4 py-2 text-[13px] text-foreground transition-colors hover:border-emerald-600/40 hover:text-emerald-700 dark:hover:text-emerald-400"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
