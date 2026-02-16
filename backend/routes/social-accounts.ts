import { Hono } from "hono";
import type { SocialAccountDto, ListResponse } from "../types/dto.ts";
import { SUPPORTED_PLATFORMS } from "../constants/platforms.ts";
import { parseOffsetLimit, buildMeta } from "../lib/pagination.ts";

const socialAccounts = new Hono();

// GET /v1/social-accounts – paginated list (query: offset, limit, platform[], username[])
socialAccounts.get("/", (c) => {
  const { offset, limit } = parseOffsetLimit(c);
  // TODO: apply filters platform, username; fetch from store
  const total = 0;
  const data: SocialAccountDto[] = [];
  const query = c.req.raw.url ? Object.fromEntries(new URL(c.req.raw.url).searchParams) : {};
  const meta = buildMeta(total, offset, limit, "/v1/social-accounts", query);
  return c.json<ListResponse<SocialAccountDto>>({ data, meta }, 200);
});

// GET /v1/social-accounts/:id (id is number in spec)
socialAccounts.get("/:id", (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid id" }, 400);
  }
  const item: SocialAccountDto = {
    id,
    platform: SUPPORTED_PLATFORMS[0], // linkedin
    username: "skeleton_username",
  };
  return c.json<SocialAccountDto>(item, 200);
});

export { socialAccounts };
