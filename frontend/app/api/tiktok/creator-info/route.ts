"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { connectedAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { decryptToken } from "@/lib/encryption";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");

  if (!accountId) {
    return Response.json({ error: "accountId is required" }, { status: 400 });
  }

  // Verify account belongs to user and is TikTok
  const account = await db.query.connectedAccounts.findFirst({
    where: and(
      eq(connectedAccounts.id, accountId),
      eq(connectedAccounts.userId, session.user.id),
      eq(connectedAccounts.platform, "tiktok"),
    ),
  });

  if (!account) {
    return Response.json(
      { error: "TikTok account not found or doesn't belong to you" },
      { status: 404 },
    );
  }

  const accessToken = decryptToken(
    account.encryptedAccessToken,
    account.id,
  );

  try {
    // TikTok Content Posting API: creator info is POST to /v2/post/publish/creator_info/query/
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({}),
      },
    );

    const data = await response.json().catch(() => ({})) as {
      data?: {
        privacy_level_options?: string[];
        max_video_post_duration_sec?: number;
        creator_username?: string;
        creator_nickname?: string;
        creator_avatar_url?: string;
        comment_disabled?: boolean;
        duet_disabled?: boolean;
        stitch_disabled?: boolean;
      };
      error?: { code?: string; message?: string; log_id?: string };
    };

    const err = data.error;
    if (err && err.code !== "ok") {
      const status = response.status === 401 ? 401 : response.status === 429 ? 429 : 400;
      return Response.json(
        {
          error: err.message || "Failed to fetch creator info",
          code: err.code,
        },
        { status },
      );
    }

    if (!response.ok) {
      return Response.json(
        {
          error: data.error?.message || "Failed to fetch creator info",
          code: data.error?.code,
        },
        { status: response.status },
      );
    }

    // Map API response to shape expected by TikTokSettings
    const apiData = data.data;
    const mapped = {
      data: apiData
        ? {
            privacy_level_options: apiData.privacy_level_options,
            max_video_duration: apiData.max_video_post_duration_sec,
            creator_username: apiData.creator_username,
            creator_nickname: apiData.creator_nickname,
            creator_avatar_url: apiData.creator_avatar_url,
            comment_disabled: apiData.comment_disabled,
            duet_disabled: apiData.duet_disabled,
            stitch_disabled: apiData.stitch_disabled,
          }
        : undefined,
      error: data.error,
    };
    return Response.json(mapped);
  } catch (err) {
    console.error("TikTok creator info error:", err);
    return Response.json(
      { error: "Failed to fetch creator info" },
      { status: 500 },
    );
  }
}
