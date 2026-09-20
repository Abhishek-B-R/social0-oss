import Link from "@/components/AppLink";
import { parseInline } from "@/lib/rich-text";

function isExternal(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

/**
 * Renders the inline subset used in blog copy (**bold**, `code`, [links](/path))
 * as React elements. Nothing here touches dangerouslySetInnerHTML.
 */
export function RichText({ text }: { text: string }) {
  const nodes = parseInline(text);

  return (
    <>
      {nodes.map((node, index) => {
        const key = `${node.type}-${index}`;
        switch (node.type) {
          case "strong":
            return (
              <strong key={key} className="font-semibold text-foreground">
                {node.value}
              </strong>
            );
          case "code":
            return (
              <code
                key={key}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em] text-foreground"
              >
                {node.value}
              </code>
            );
          case "link":
            return isExternal(node.href) ? (
              <a
                key={key}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 underline underline-offset-2 transition-colors hover:text-emerald-600 dark:text-emerald-400"
              >
                {node.value}
              </a>
            ) : (
              <Link
                key={key}
                href={node.href}
                className="text-emerald-700 underline underline-offset-2 transition-colors hover:text-emerald-600 dark:text-emerald-400"
              >
                {node.value}
              </Link>
            );
          default:
            return <span key={key}>{node.value}</span>;
        }
      })}
    </>
  );
}
