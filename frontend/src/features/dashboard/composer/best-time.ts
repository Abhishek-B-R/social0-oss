import type { MetricMap, PublicationMetrics } from "@/api/analytics";
import { fromWall, safeTimezone, wallParts } from "./nl-time";

/** Fewer published posts than this and the "Best time" preset stays hidden. */
export const BEST_TIME_MIN_POSTS = 10;
/** A weekday or hour needs at least this many publications to count. */
const MIN_PER_BUCKET = 2;
/** Don't suggest a time that's about to pass. */
const MIN_LEAD_MS = 15 * 60_000;

export type BestTime = {
  at: Date;
  /** Published posts the suggestion is based on. */
  sample: number;
};

function engagement(m: MetricMap): number {
  return (
    (m.likes ?? 0) +
    (m.comments ?? 0) +
    (m.shares ?? 0) +
    (m.reposts ?? 0) +
    (m.saves ?? 0) +
    (m.quotes ?? 0)
  );
}

type Bucket = { sum: number; n: number };

function bestKey(buckets: Map<number, Bucket>): number | null {
  let best: number | null = null;
  let bestAvg = 0;
  for (const [key, b] of buckets) {
    if (b.n < MIN_PER_BUCKET) continue;
    const avg = b.sum / b.n;
    if (avg > bestAvg) {
      best = key;
      bestAvg = avg;
    }
  }
  return best;
}

function add(buckets: Map<number, Bucket>, key: number, value: number) {
  const b = buckets.get(key) ?? { sum: 0, n: 0 };
  b.sum += value;
  b.n += 1;
  buckets.set(key, b);
}

/**
 * Next occurrence of the weekday + hour whose publications got the most
 * engagement on average (views when no network reported engagement), in
 * the post's timezone. Null without enough history: fewer than
 * {@link BEST_TIME_MIN_POSTS} published posts, or no hour with a clear
 * signal.
 */
export function bestTimeFromPublications(
  publications: readonly PublicationMetrics[],
  timezone: string,
  now: Date = new Date(),
): BestTime | null {
  const tz = safeTimezone(timezone);
  const rows = publications
    .filter((p) => p.status === "ok" && p.publishedAt)
    .map((p) => ({ postId: p.postId, at: new Date(p.publishedAt!), metrics: p.metrics }))
    .filter((r) => !Number.isNaN(r.at.getTime()));
  const sample = new Set(rows.map((r) => r.postId)).size;
  if (sample < BEST_TIME_MIN_POSTS) return null;

  const useViews = rows.every((r) => engagement(r.metrics) === 0);
  const valueOf = (m: MetricMap) => (useViews ? (m.views ?? 0) : engagement(m));

  const byHour = new Map<number, Bucket>();
  const byWeekday = new Map<number, Bucket>();
  for (const r of rows) {
    const w = wallParts(r.at, tz);
    const value = valueOf(r.metrics);
    add(byHour, w.hour, value);
    add(byWeekday, new Date(w.year, w.month, w.day).getDay(), value);
  }
  const hour = bestKey(byHour);
  if (hour == null) return null;
  const weekday = bestKey(byWeekday);

  const today = wallParts(now, tz);
  for (let i = 0; i < 8; i++) {
    const at = fromWall(tz, today.year, today.month, today.day + i, hour, 0);
    if (at.getTime() < now.getTime() + MIN_LEAD_MS) continue;
    if (weekday != null) {
      const w = wallParts(at, tz);
      if (new Date(w.year, w.month, w.day).getDay() !== weekday) continue;
    }
    return { at, sample };
  }
  return null;
}
