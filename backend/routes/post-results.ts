import { Hono } from "hono";
import type { PostResultDto, ListResponse } from "../types/dto.ts";
import { parseOffsetLimit, buildMeta } from "../lib/pagination.ts";

const postResults = new Hono();

// GET /v1/post-results – paginated list (query: offset, limit, post_id[], platform[])
postResults.get("/", (c) => {
  const { offset, limit } = parseOffsetLimit(c);
  // TODO: apply filters post_id, platform; fetch from store
  const total = 0;
  const data: PostResultDto[] = [];
  const query = c.req.raw.url
    ? Object.fromEntries(new URL(c.req.raw.url).searchParams)
    : {};
  const meta = buildMeta(total, offset, limit, "/v1/post-results", query);
  return c.json<ListResponse<PostResultDto>>({ data, meta }, 200);
});

// GET /v1/post-results/:id
postResults.get("/:id", (c) => {
  const id = c.req.param("id");
  const item: PostResultDto = {
    id,
    post_id: "skeleton-post-id",
    success: true,
    social_account_id: 0,
    error: null,
    platform_data: { id: undefined, url: undefined, username: undefined },
  };
  return c.json<PostResultDto>(item, 200);
});

export { postResults };
