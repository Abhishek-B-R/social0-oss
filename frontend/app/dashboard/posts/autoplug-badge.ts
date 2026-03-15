/** Server-safe: returns label and className for autoplug status badge. */
export function getAutoPlugBadge(status?: string | null): {
  label: string;
  className: string;
} | null {
  switch (status) {
    case "watching":
      return {
        label: "Auto-Plug watching",
        className: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
      };
    case "triggered":
      return {
        label: "Auto-Plug sent",
        className:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
      };
    case "expired":
      return {
        label: "Auto-Plug expired",
        className:
          "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
      };
    case "failed":
      return {
        label: "Auto-Plug failed",
        className: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200",
      };
    default:
      return null;
  }
}
