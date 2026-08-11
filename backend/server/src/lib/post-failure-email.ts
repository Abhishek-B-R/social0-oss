import { db } from "@/db";
import { posts, user, userSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mail";
import { PLATFORMS } from "@/lib/platforms";

export type PostFailureEmailItem = {
  platform: string;
  platformUsername?: string | null;
  error?: string | null;
};

const FAILURE_EMAIL_SENT_KEY = "_failureEmailSentAt";

/** One failure email per post (queue retries / parallel finalize safe). */
async function claimPostFailureEmail(postId: string): Promise<boolean> {
  const sentAt = new Date().toISOString();
  const claimed = await db
    .update(posts)
    .set({
      metadata: sql`coalesce(${posts.metadata}, '{}'::jsonb) || jsonb_build_object(${FAILURE_EMAIL_SENT_KEY}, ${sentAt})`,
      updatedAt: new Date(),
    })
    .where(
      sql`${posts.id} = ${postId} and (${posts.metadata}->>${FAILURE_EMAIL_SENT_KEY}) is null`,
    )
    .returning({ id: posts.id });
  return claimed.length > 0;
}

/** Allow a later retry if the provider send failed after we claimed. */
async function releasePostFailureEmailClaim(postId: string): Promise<void> {
  await db
    .update(posts)
    .set({
      metadata: sql`coalesce(${posts.metadata}, '{}'::jsonb) - ${FAILURE_EMAIL_SENT_KEY}`,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));
}

function platformDisplayName(platformId: string): string {
  return PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;
}

function accountLabel(platform: string, platformUsername?: string | null): string {
  const name = platformDisplayName(platform);
  const handle = platformUsername?.trim();
  if (handle) {
    const formatted = handle.startsWith("@") ? handle : `@${handle}`;
    return `${name} (${formatted})`;
  }
  return name;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPostFailureEmailHtml(input: {
  postUrl: string;
  failures: PostFailureEmailItem[];
}): string {
  const rows = input.failures
    .map(
      (f) => `
        <li style="margin:0 0 12px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827">
            ${escapeHtml(accountLabel(f.platform, f.platformUsername))}
          </p>
          ${
            f.error
              ? `<p style="margin:0;font-size:13px;color:#6b7280">${escapeHtml(f.error)}</p>`
              : ""
          }
        </li>`,
    )
    .join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <h2 style="font-size:20px;font-weight:600;margin:0 0 8px">Your post did not publish everywhere</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#4b5563">
        One or more platforms failed when Social0 tried to publish your post. Other platforms may still have succeeded.
      </p>
      <ul style="margin:0 0 20px;padding:0;list-style:none">${rows}</ul>
      <a href="${escapeHtml(input.postUrl)}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 18px;border-radius:10px">
        View post details
      </a>
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">
        You can turn off these emails in Settings → Email preferences.
      </p>
    </div>
  `;
}

/** Send a post-failure email when automation + this preference are enabled. Never throws. */
export async function maybeSendPostFailureEmail(input: {
  userId: string;
  postId: string;
  failures: PostFailureEmailItem[];
}): Promise<void> {
  if (input.failures.length === 0) return;

  try {
    const [settingsRow, userRow] = await Promise.all([
      db.query.userSettings.findFirst({
        where: eq(userSettings.userId, input.userId),
        columns: { automationEmails: true, emailOnPostFailed: true },
      }),
      db.query.user.findFirst({
        where: eq(user.id, input.userId),
        columns: { email: true, name: true },
      }),
    ]);

    const automationOn = settingsRow?.automationEmails ?? true;
    const postFailureOn = settingsRow?.emailOnPostFailed ?? true;
    if (!automationOn || !postFailureOn) {
      console.info(
        "[post-failure-email] skipped: preference off",
        input.postId,
        { automationOn, postFailureOn },
      );
      return;
    }

    const email = userRow?.email?.trim();
    if (!email) {
      console.warn("[post-failure-email] skipped: user has no email", input.postId);
      return;
    }

    if (!(await claimPostFailureEmail(input.postId))) {
      console.info(
        "[post-failure-email] skipped: already claimed",
        input.postId,
      );
      return;
    }

    const postUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/dashboard/posts/${input.postId}`;
    const subject =
      input.failures.length === 1
        ? `Post failed on ${accountLabel(
            input.failures[0].platform,
            input.failures[0].platformUsername,
          )}`
        : `${input.failures.length} platforms failed to publish your post`;

    try {
      const sent = await sendEmail({
        to: email,
        subject,
        html: buildPostFailureEmailHtml({ postUrl, failures: input.failures }),
      });
      console.info("[post-failure-email] sent", {
        postId: input.postId,
        to: email,
        resendId: sent.id ?? null,
        failures: input.failures.length,
      });
    } catch (sendErr) {
      await releasePostFailureEmailClaim(input.postId).catch((releaseErr) =>
        console.error(
          "[post-failure-email] failed to release claim after send error:",
          releaseErr,
        ),
      );
      throw sendErr;
    }
  } catch (err) {
    console.error("[post-failure-email] Failed to send:", err);
  }
}
