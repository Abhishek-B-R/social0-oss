import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
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
  const due = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.status, "scheduled"),
        lte(posts.scheduledAt, now),
      ),
    );

  const processed: string[] = [];
  for (const post of due) {
    await executePublish(post.id);
    processed.push(post.id);
  }

  return NextResponse.json({ processed: processed.length, ids: processed });
}
