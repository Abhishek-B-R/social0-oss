"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { posts, postPublications } from "@/db/schema";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

export type CreatePostResult =
  | { success: true; postId: string }
  | { success: false; error: string };

export type PublishMode = "draft" | "now" | "scheduled";

export async function createPost(
  content: string,
  selectedAccountIds: string[],
  mode: PublishMode,
  scheduledAt: Date | null,
): Promise<CreatePostResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, error: "Post content is required" };
  }

  if (selectedAccountIds.length === 0) {
    return {
      success: false,
      error: "Select at least one account to publish to",
    };
  }

  if (mode === "scheduled" && !scheduledAt) {
    return { success: false, error: "Please pick a date and time to schedule" };
  }

  const status = mode === "draft" ? "draft" : "scheduled";
  const resolvedScheduledAt =
    mode === "now" ? new Date() : mode === "scheduled" ? scheduledAt : null;

  try {
    const [postRow] = await db
      .insert(posts)
      .values({
        userId: session.user.id,
        originalContent: trimmed,
        finalContent: trimmed,
        status,
        scheduledAt: resolvedScheduledAt,
        mediaIds: [],
      })
      .returning({ id: posts.id });

    if (!postRow) {
      return { success: false, error: "Failed to create post" };
    }

    await db.insert(postPublications).values(
      selectedAccountIds.map((connectedAccountId) => ({
        postId: postRow.id,
        connectedAccountId,
        status: "pending" as const,
      })),
    );

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/posts");
    revalidatePath("/dashboard/posts/new");

    return { success: true, postId: postRow.id };
  } catch (e) {
    console.error("createPost error:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create post",
    };
  }
}
