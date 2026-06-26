import type { EmailPostFailedJob } from "@social0/shared";

/** Port from frontend email templates - Resend/Postmark/etc. */
export async function sendPostFailedEmail(
  job: EmailPostFailedJob,
): Promise<void> {
  console.info(
    `[worker] email post-failed user=${job.userId} post=${job.postId} platform=${job.platform}: ${job.errorMessage}`,
  );
}
