/**
 * Coercion helpers for untrusted numerics.
 *
 * `Math.max(1, Math.round(x))` is NaN when `x` is not a number, and NaN then
 * flows silently into `new Date(...)` (Invalid Date) or an integer column
 * (a driver-level error). These clamp first and fall back on anything
 * unusable, so a bad client value becomes a sane default rather than a 500.
 */

/** Integer in [min, max]; `fallback` for anything non-finite. */
export function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(min, Math.round(n)), max);
}

/** Number in [min, max] rounded to `decimals` places; `fallback` when non-finite. */
export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  decimals = 0,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const factor = 10 ** decimals;
  return Math.min(Math.max(min, Math.round(n * factor) / factor), max);
}

/** Trimmed string capped at `maxLength`; empty for any non-string. */
export function coerceTrimmedString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
