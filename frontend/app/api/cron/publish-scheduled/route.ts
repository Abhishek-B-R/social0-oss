import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts, queuedPosts } from "@/db/schema";
import { and, eq, lt, lte } from "drizzle-orm";
import { executePublish } from "@/app/actions/publish";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // Mark stuck "publishing" posts as failed so they don't stay in limbo forever
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await db
    .update(posts)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(eq(posts.status, "publishing"), lt(posts.updatedAt, oneHourAgo)),
    );

  const now = new Date();

  // Scheduled posts (manual schedule)
  const due = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, now)));

  const processed: string[] = [];
  for (const post of due) {
    await executePublish(post.id);
    processed.push(post.id);
  }

  // Queued posts (Buffer-style queue): publish when scheduledFor <= now
  const dueQueued = await db
    .select({ id: queuedPosts.id, postId: queuedPosts.postId })
    .from(queuedPosts)
    .where(
      and(
        eq(queuedPosts.status, "pending"),
        lte(queuedPosts.scheduledFor, now),
      ),
    );

  const queuedProcessed: string[] = [];
  for (const q of dueQueued) {
    const result = await executePublish(q.postId);
    await db
      .update(queuedPosts)
      .set({ status: result.success ? "done" : "failed" })
      .where(eq(queuedPosts.id, q.id));
    queuedProcessed.push(q.postId);
  }

  return NextResponse.json({
    processed: processed.length,
    ids: processed,
    queuedProcessed: queuedProcessed.length,
    queuedIds: queuedProcessed,
  });
}
