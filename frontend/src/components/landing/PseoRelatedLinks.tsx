import Link from "@/components/AppLink";

export function PseoRelatedLinks({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  if (links.length === 0) return null;

  return (
    <section className="border-t border-border px-6 py-12 lg:px-8">
      <div className="mx-auto max-w-[1100px]">
        <h2 className="mb-5 text-[11px] uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
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
