/**
 * Minimal inline formatting for blog copy.
 *
 * Supports exactly three constructs, single level, no nesting:
 *   **bold**            -> strong
 *   `code`              -> inline code
 *   [label](/path)      -> link
 *
 * Deliberately not a Markdown parser: article bodies are typed blocks
 * (see `@/lib/content/blog-types`), so the only thing left to resolve is
 * inline emphasis. Output is a node list the renderer turns into React
 * elements, which keeps body copy off `dangerouslySetInnerHTML`.
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string };

/** Matches the first of: [label](href), **bold**, `code`. */
const INLINE_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/;

export function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = input;

  while (rest.length > 0) {
    const match = INLINE_PATTERN.exec(rest);
    if (!match || match.index === undefined) break;

    if (match.index > 0) {
      nodes.push({ type: "text", value: rest.slice(0, match.index) });
    }

    const [full, linkLabel, linkHref, boldValue, codeValue] = match;
    if (linkLabel !== undefined && linkHref !== undefined) {
      nodes.push({ type: "link", value: linkLabel, href: linkHref });
    } else if (boldValue !== undefined) {
      nodes.push({ type: "strong", value: boldValue });
    } else if (codeValue !== undefined) {
      nodes.push({ type: "code", value: codeValue });
    }

    rest = rest.slice(match.index + full.length);
  }

  if (rest.length > 0) {
    nodes.push({ type: "text", value: rest });
  }

  return nodes;
}

/** Strip inline markers — for meta descriptions, schema.org text, and excerpts. */
export function plainText(input: string): string {
  return parseInline(input)
    .map((node) => node.value)
    .join("");
}

/** Stable, URL-safe heading id for table-of-contents anchors. */
export function slugifyHeading(input: string): string {
  return plainText(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
