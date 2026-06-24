export function parseOffsetLimit(
  offsetRaw: string | undefined,
  limitRaw: string | undefined,
): { offset: number; limit: number } {
  const offset = Math.max(0, Number(offsetRaw) || 0);
  const limit = Math.min(100, Math.max(1, Number(limitRaw) || 10));
  return { offset, limit };
}

export function buildMeta(
  total: number,
  offset: number,
  limit: number,
  path: string,
  query: Record<string, string>,
): {
  total: number;
  offset: number;
  limit: number;
  next: string | null;
} {
  const nextOffset = offset + limit;
  const next =
    nextOffset < total
      ? `${path}?${new URLSearchParams({ ...query, offset: String(nextOffset), limit: String(limit) }).toString()}`
      : null;
  return { total, offset, limit, next };
}
