/** Shared isometric helpers — true 30° axonometric matrices (not CSS skew). */

export const ISO = {
  /** Top face: cos30, sin30, -cos30, sin30 */
  top: (tx: number, ty: number) =>
    `matrix(0.86603 0.5 -0.86603 0.5 ${tx} ${ty})`,
  /** Right face */
  right: (tx: number, ty: number) =>
    `matrix(0.86603 0.5 0 1 ${tx} ${ty})`,
  /** Left face */
  left: (tx: number, ty: number) =>
    `matrix(0.86603 -0.5 0 1 ${tx} ${ty})`,
} as const;

export const C = {
  bg: "#0c0c0c",
  surface: "#151515",
  elevated: "#1a1a1a",
  panel: "#1e1e1e",
  muted: "#262626",
  mid: "#303030",
  stroke: "#a5a5a5",
  strokeSoft: "#555555",
  strokeBright: "#e0e0e0",
  white: "#ffffff",
  accent: "#10b981",
  accentHot: "#34d399",
  accentDim: "#059669",
  accentGlow: "#00ff77",
} as const;
