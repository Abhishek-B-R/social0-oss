import type { PaginationMeta } from "../types/dto.ts";

const DEFAULT_OFFSET = 0;
const DEFAULT_LIMIT = 10;

export function parseOffsetLimit(c: {
  req: { query: (k: string) => string | undefined };
}): {
  offset: number;
  limit: number;
} {
  const rawOffset = c.req.query("offset");
  const rawLimit = c.req.query("limit");
  const offset =
    rawOffset !== undefined
      ? Math.max(0, parseInt(rawOffset, 10) || 0)
      : DEFAULT_OFFSET;
  const limit =
    rawLimit !== undefined
      ? Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 10))
      : DEFAULT_LIMIT;
  return { offset, limit };
}

export function buildMeta(
  total: number,
  offset: number,
  limit: number,
  basePath: string,
  query: Record<string, string | string[] | undefined> = {},
): PaginationMeta {
  const nextOffset = offset + limit;
  const next =
    nextOffset < total
      ? buildNextUrl(basePath, nextOffset, limit, query)
      : null;
  return { total, offset, limit, next };
}

function buildNextUrl(
  basePath: string,
  offset: number,
  limit: number,
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams({
    ...query,
    offset: String(offset),
    limit: String(limit),
  } as Record<string, string>);
  return `${basePath}?${params.toString()}`;
}
