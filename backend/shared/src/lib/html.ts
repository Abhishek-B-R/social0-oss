/**
 * Escape a value for interpolation into the HTML email templates.
 *
 * Every attribute in those templates is double-quoted, so `"` is the quote that
 * must not survive; `'` is escaped anyway rather than relying on that staying
 * true.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
