import Link from "@/components/AppLink";
import { RichText } from "@/components/blog/RichText";
import type { BlogBlock } from "@/lib/content/blog-types";
import { slugifyHeading } from "@/lib/rich-text";

function BlockView({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h2
          id={slugifyHeading(block.text)}
          className="mt-14 scroll-mt-24 font-serif text-[clamp(24px,3vw,32px)] leading-tight tracking-tight text-[#333C4D] dark:text-white"
        >
          <RichText text={block.text} />
        </h2>
      );

    case "subheading":
      return (
        <h3 className="mt-9 text-[18px] font-semibold text-[#333C4D] dark:text-white">
          <RichText text={block.text} />
        </h3>
      );

    case "paragraph":
      return (
        <p className="mt-5 text-[17px] leading-[1.75] text-muted-foreground">
          <RichText text={block.text} />
        </p>
      );

    case "list":
      return block.ordered ? (
        <ol className="mt-5 list-decimal space-y-3 pl-6 text-[17px] leading-[1.75] text-muted-foreground marker:text-emerald-700">
          {block.items.map((item, index) => (
            <li key={`${index}-${item}`} className="pl-1">
              <RichText text={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="mt-5 list-disc space-y-3 pl-6 text-[17px] leading-[1.75] text-muted-foreground marker:text-emerald-700">
          {block.items.map((item, index) => (
            <li key={`${index}-${item}`} className="pl-1">
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );

    case "table":
      return (
        <figure className="mt-8">
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-muted/40">
                  {block.columns.map((column, index) => (
                    <th
                      key={`${index}-${column}`}
                      scope="col"
                      className="border-b border-border px-4 py-3 text-[13px] font-semibold text-[#333C4D] dark:text-white"
                    >
                      <RichText text={column} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr
                    key={`${rowIndex}-${row[0] ?? ""}`}
                    className={
                      rowIndex % 2 === 1 ? "bg-muted/15" : undefined
                    }
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={`${cellIndex}-${cell}`}
                        className="border-b border-border px-4 py-3 align-top leading-relaxed text-muted-foreground last:border-b-0"
                      >
                        <RichText text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption ? (
            <figcaption className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              <RichText text={block.caption} />
            </figcaption>
          ) : null}
        </figure>
      );

    case "callout":
      return (
        <aside className="mt-8 rounded-2xl border border-emerald-600/25 bg-emerald-50/60 px-6 py-5 dark:bg-emerald-500/[0.07]">
          {block.title ? (
            <p className="mb-2 text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              {block.title}
            </p>
          ) : null}
          <p className="text-[16px] leading-relaxed text-foreground/90">
            <RichText text={block.text} />
          </p>
        </aside>
      );

    case "quote":
      return (
        <blockquote className="mt-8 border-l-2 border-emerald-600/50 pl-5">
          <p className="font-serif text-[20px] leading-relaxed text-[#333C4D] dark:text-white">
            <RichText text={block.text} />
          </p>
          {block.attribution ? (
            <footer className="mt-2 text-[14px] text-muted-foreground">
              — {block.attribution}
            </footer>
          ) : null}
        </blockquote>
      );

    case "code":
      return (
        <pre className="mt-6 overflow-x-auto rounded-2xl border border-border bg-muted/40 px-5 py-4 text-[13px] leading-relaxed dark:bg-black/30">
          <code className="font-mono text-foreground/90">{block.code}</code>
        </pre>
      );

    case "cta":
      return (
        <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-muted/20 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[16px] leading-relaxed text-foreground/90">
            <RichText text={block.text} />
          </p>
          <Link
            href={block.href}
            className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-foreground px-5 py-3 text-[14px] font-medium text-background transition-all hover:-translate-y-px dark:bg-white dark:text-black"
          >
            {block.label}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      );

    default:
      return null;
  }
}

export function BlogBody({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div>
      {blocks.map((block, index) => (
        <BlockView key={`${block.type}-${index}`} block={block} />
      ))}
    </div>
  );
}
