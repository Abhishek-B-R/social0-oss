import { sql } from "drizzle-orm";
import {
  LEGAL_UPDATE_NOTIFICATION_KEY,
  LEGAL_VERSIONS,
  LEGAL_ENTITY,
} from "@social0/shared";
import { db } from "../db/index.js";
import { user } from "../db/schema.js";
import { redis } from "./redis.js";
import { sendEmail } from "./mail.js";

const REDIS_KEY = `legal:notified:${LEGAL_UPDATE_NOTIFICATION_KEY}`;
const WEBSITE = "https://social0.app";

function buildLegalUpdateEmailHtml(): string {
  const termsUrl = `${WEBSITE}/terms`;
  const privacyUrl = `${WEBSITE}/privacy`;
  return `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
      <p>Hello,</p>
      <p>
        We have updated Social0’s
        <a href="${termsUrl}">Terms of Service</a> (v${LEGAL_VERSIONS.terms})
        and
        <a href="${privacyUrl}">Privacy Policy</a> (v${LEGAL_VERSIONS.privacy}).
      </p>
      <p>
        Please review the updated documents. Continued use of Social0 after these
        changes take effect means you accept the revised Terms and Privacy Policy,
        except where applicable law requires a different form of consent.
      </p>
      <p>
        If you do not agree, you may cancel your subscription and/or delete your
        account from Settings.
      </p>
      <p>
        — ${LEGAL_ENTITY.tradingAs}<br/>
        ${LEGAL_ENTITY.legalEmail}
      </p>
    </div>
  `.trim();
}

export type LegalUpdateNotifyResult = {
  skipped: boolean;
  reason?: string;
  emailsSent: number;
  emailsFailed: number;
};

/**
 * Email all users with an email address about Terms/Privacy version bumps.
 * Idempotent via Redis key for LEGAL_UPDATE_NOTIFICATION_KEY.
 * Trigger after deploying a LEGAL_VERSIONS bump: POST /api/cron/notify-legal-update
 */
export async function notifyUsersOfLegalUpdate(options?: {
  force?: boolean;
}): Promise<LegalUpdateNotifyResult> {
  if (!options?.force && redis) {
    const already = await redis.get(REDIS_KEY);
    if (already) {
      return {
        skipped: true,
        reason: `Already notified for ${LEGAL_UPDATE_NOTIFICATION_KEY}`,
        emailsSent: 0,
        emailsFailed: 0,
      };
    }
  }

  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(sql`${user.email} is not null and trim(${user.email}) <> ''`);

  const html = buildLegalUpdateEmailHtml();
  const subject = `Social0 Terms & Privacy updated (v${LEGAL_VERSIONS.terms})`;

  let emailsSent = 0;
  let emailsFailed = 0;

  for (const row of rows) {
    const to = row.email?.trim();
    if (!to) continue;
    try {
      await sendEmail({ to, subject, html });
      emailsSent += 1;
    } catch (err) {
      emailsFailed += 1;
      console.warn("[legal-update-notify] send failed:", to, err);
    }
  }

  if (redis && (emailsFailed === 0 || emailsSent > 0)) {
    await redis.set(
      REDIS_KEY,
      emailsFailed === 0
        ? new Date().toISOString()
        : `partial:${emailsSent}:${emailsFailed}`,
    );
  }

  return { skipped: false, emailsSent, emailsFailed };
}
