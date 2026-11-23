/**
 * Shared axis formatters for the analytics charts. Chart components only
 * render; tick labels are derived here so every chart reads the same way.
 */

import { format } from "date-fns";
import { formatMetric } from "./analytics-utils";

function dayDate(iso: string): Date | null {
  const bare = iso.slice(0, 10);
  const d = new Date(`${bare}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function chartDayTick(iso: string, days: number): string {
  const d = dayDate(iso);
  if (!d) return "";
  if (days > 180) return format(d, "MMM");
  return format(d, "MMM d");
}

export function axisTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 1000) return formatMetric(v);
  return String(Math.round(v));
}
