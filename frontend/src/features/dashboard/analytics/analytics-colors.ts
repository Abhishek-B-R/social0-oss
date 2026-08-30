/** Fixed categorical palette for analytics charts (green / blue / amber / rose / teal). */
export const VIZ = {
  emerald: "var(--viz-emerald, #10b981)",
  blue: "var(--viz-blue, #3b82f6)",
  amber: "var(--viz-amber, #f59e0b)",
  rose: "var(--viz-rose, #f43f5e)",
  teal: "var(--viz-teal, #14b8a6)",
} as const;

export const MIX_COLORS: Record<string, string> = {
  likes: VIZ.rose,
  comments: VIZ.blue,
  shares: VIZ.amber,
  quotes: VIZ.teal,
  saves: VIZ.emerald,
  clicks: VIZ.blue,
};
