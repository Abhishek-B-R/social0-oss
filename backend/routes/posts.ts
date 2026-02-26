import { Hono } from "hono";
import type {
  PostDto,
  CreatePostDto,
  UpdatePostDto,
  DeleteEntityResponseDto,
  ListResponse,
} from "../types/dto.ts";
import { parseOffsetLimit, buildMeta } from "../lib/pagination.ts";

const posts = new Hono();

// GET /v1/posts – paginated list (query: offset, limit, platform[], status[])
// platform: Social0 platforms (linkedin, facebook, instagram, youtube, pinterest, tiktok, twitter, threads, bluesky)
// status: draft | scheduled | publishing | published | failed
posts.get("/", (c) => {
  const { offset, limit } = parseOffsetLimit(c);
  // TODO: apply filters platform, status; fetch from store
  const total = 0;
  const data: PostDto[] = [];
  const query = c.req.raw.url ? Object.fromEntries(new URL(c.req.raw.url).searchParams) : {};
  const meta = buildMeta(total, offset, limit, "/v1/posts", query);
  return c.json<ListResponse<PostDto>>({ data, meta }, 200);
});

// POST /v1/posts
posts.post("/", async (c) => {
  const body = await c.req.json<CreatePostDto>();
  // TODO: validate (caption, social_accounts required); create post
  const now = new Date().toISOString();
  const item: PostDto = {
    id: "skeleton-post-id",
    caption: body.caption ?? "",
    status: body.is_draft ? "draft" : "scheduled",
    scheduled_at: body.scheduled_at ?? null,
    platform_configurations: body.platform_configurations ?? null,
    social_accounts: body.social_accounts ?? [],
    account_configurations: body.account_configurations ?? null,
    media: body.media ? { ids: body.media } : null,
    created_at: now,
    updated_at: now,
    is_draft: body.is_draft ?? false,
  };
  return c.json<PostDto>(item, 200);
});

// GET /v1/posts/:id
posts.get("/:id", (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();
  const item: PostDto = {
    id,
    caption: "",
    status: "draft",
    scheduled_at: null,
    platform_configurations: null,
    social_accounts: [],
    account_configurations: null,
    media: null,
    created_at: now,
    updated_at: now,
    is_draft: false,
  };
  return c.json<PostDto>(item, 200);
});

// PATCH /v1/posts/:id
posts.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<UpdatePostDto>();
  const now = new Date().toISOString();
  const item: PostDto = {
    id,
    caption: body.caption ?? "",
    status: body.is_draft ? "draft" : "scheduled",
    scheduled_at: body.scheduled_at ?? null,
    platform_configurations: body.platform_configurations ?? null,
    social_accounts: body.social_accounts ?? [],
    account_configurations: body.account_configurations ?? null,
    media: body.media ? { ids: body.media } : null,
    created_at: now,
    updated_at: now,
    is_draft: body.is_draft ?? false,
  };
  return c.json<PostDto>(item, 200);
});

// DELETE /v1/posts/:id
posts.delete("/:id", (c) => {
  const _id = c.req.param("id");
  const res: DeleteEntityResponseDto = { success: true };
  return c.json<DeleteEntityResponseDto>(res, 200);
});

export { posts };
