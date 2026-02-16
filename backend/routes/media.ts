import { Hono } from "hono";
import type {
  MediaDto,
  CreateUploadUrlDto,
  CreateUploadUrlResponseDto,
  DeleteEntityResponseDto,
  ListResponse,
} from "../types/dto.ts";
import { parseOffsetLimit, buildMeta } from "../lib/pagination.ts";

const media = new Hono();

// GET /v1/media – paginated list (query: offset, limit, post_id[], type[])
media.get("/", (c) => {
  const { offset, limit } = parseOffsetLimit(c);
  // TODO: apply filters post_id, type; fetch from store
  const total = 0;
  const data: MediaDto[] = [];
  const query = c.req.raw.url
    ? Object.fromEntries(new URL(c.req.raw.url).searchParams)
    : {};
  const meta = buildMeta(total, offset, limit, "/v1/media", query);
  return c.json<ListResponse<MediaDto>>({ data, meta }, 200);
});

// GET /v1/media/:id
media.get("/:id", (c) => {
  const id = c.req.param("id");
  // TODO: fetch by id from store
  const item: MediaDto = {
    id,
    mime_type: null,
    object: { isDeleted: false, url: null, size_bytes: null, name: null },
  };
  return c.json<MediaDto>(item, 200);
});

// DELETE /v1/media/:id
media.delete("/:id", (c) => {
  const _id = c.req.param("id");
  // TODO: delete from store
  const body: DeleteEntityResponseDto = { success: true };
  return c.json<DeleteEntityResponseDto>(body, 200);
});

// POST /v1/media/create-upload-url
media.post("/create-upload-url", async (c) => {
  const body = await c.req.json<CreateUploadUrlDto>();
  // TODO: validate body; create media record and signed URL
  const res: CreateUploadUrlResponseDto = {
    media_id: "skeleton-media-id",
    upload_url: "https://example.com/upload/signed-url",
    name: body.name ?? "file",
  };
  return c.json<CreateUploadUrlResponseDto>(res, 200);
});

export { media };
