import { randomUUID } from "node:crypto";
import { asc, sql } from "drizzle-orm";
import {
  LEGAL_UPDATE_NOTIFICATION_KEY,
  LEGAL_VERSIONS,
  LEGAL_ENTITY,
} from "@social0/shared";
import { db } from "../db/index.js";
import { user } from "../db/schema.js";
import { redis } from "./redis.js";
import { sendEmail, SendEmailError } from "./mail.js";

/** Set once every user got the email for this notification key. */
const REDIS_KEY = `legal:notified:${LEGAL_UPDATE_NOTIFICATION_KEY}`;
/** One run at a time; refreshed before every send, expires if the run dies. */
const LOCK_KEY = `${REDIS_KEY}:lock`;
/** Users already mailed for this key (members are `u:<userId>`). */
const SENT_KEY = `${REDIS_KEY}:sent`;

const LOCK_TTL_SEC = 120;
const SENT_TTL_SEC = 180 * 24 * 60 * 60;
/** Resend's default limit is 2 requests/second per team; stay under it. */
const MIN_SEND_INTERVAL_MS = 600;
const SEND_TIMEOUT_MS = 30_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_BASE_BACKOFF_MS = 1_000;

const WEBSITE = "https://social0.app";

/** Compare-and-expire: only the run holding the lock keeps it alive. */
const REFRESH_LOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end`;
/** Compare-and-delete: never release a lock another run took over. */
const RELEASE_LOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

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
  emailsSent: number;
  emailsFailed: number;
  /** Users skipped because an earlier (partial) run already mailed them. */
  alreadySent: number;
  /** The run stopped early (lost its lock or Redis failed); re-run to resume. */
  aborted: boolean;
};

export type LegalUpdateNotifyClaim =
  | { status: "unavailable"; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "running"; reason: string }
  | { status: "claimed"; lockToken: string; alreadySent: number };

const sentMember = (userId: string) => `u:${userId}`;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`send timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isRateLimited(err: unknown): err is SendEmailError {
  return (
    err instanceof SendEmailError &&
    (err.statusCode === 429 || err.code === "rate_limit_exceeded")
  );
}

/**
 * Take the single-run claim for this notification key. Call before answering
 * the request; on `claimed`, hand the token to `runLegalUpdateNotify` in the
 * background. Retries of the trigger while a run is live get `running` (409)
 * instead of starting a second mailer.
 *
 * `force` re-sends to everyone: it clears the done marker and the per-user
 * progress for this key once the claim is held.
 */
export async function claimLegalUpdateNotify(options?: {
  force?: boolean;
}): Promise<LegalUpdateNotifyClaim> {
  if (!redis) {
    // Without Redis there is no claim or progress, so a retry would mail
    // every user again. Refuse instead.
    return {
      status: "unavailable",
      reason: "Redis is required to track legal-update notifications",
    };
  }

  if (!options?.force) {
    const already = await redis.get<string>(REDIS_KEY);
    if (already) {
      return {
        status: "skipped",
        reason: `Already notified for ${LEGAL_UPDATE_NOTIFICATION_KEY} (${String(already)})`,
      };
    }
  }

  const lockToken = randomUUID();
  const acquired = await redis.set(LOCK_KEY, lockToken, {
    nx: true,
    ex: LOCK_TTL_SEC,
  });
  if (acquired === null) {
    return {
      status: "running",
      reason: `A notification run for ${LEGAL_UPDATE_NOTIFICATION_KEY} is already in progress`,
    };
  }

  if (options?.force) {
    await redis.del(REDIS_KEY, SENT_KEY);
  }

  const alreadySent = await redis.scard(SENT_KEY);
  return { status: "claimed", lockToken, alreadySent };
}

/**
 * Email every user about the Terms/Privacy bump, resuming where an earlier
 * run stopped. Requires a claim from `claimLegalUpdateNotify`.
 *
 * - Each successful send is recorded in a Redis set, so a re-run (after a
 *   crash, restart, or failed sends) only mails users not yet mailed.
 * - Sends are throttled under Resend's rate limit; 429s back off and retry.
 * - The done marker is written only when every user has been mailed.
 * - Each send carries a per-user Resend idempotency key, so a send that timed
 *   out here but landed at Resend is not delivered twice on a re-run.
 */
export async function runLegalUpdateNotify(
  lockToken: string,
): Promise<LegalUpdateNotifyResult> {
  if (!redis) throw new Error("Redis is required");
  const r = redis;

  let emailsSent = 0;
  let emailsFailed = 0;
  let alreadySent = 0;
  let aborted = false;

  try {
    const sentMembers = await r.smembers(SENT_KEY);
    const sent = new Set(sentMembers.map((m) => String(m)));

    const rows = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(sql`${user.email} is not null and trim(${user.email}) <> ''`)
      .orderBy(asc(user.id));

    const html = buildLegalUpdateEmailHtml();
    const subject = `Social0 Terms & Privacy updated (v${LEGAL_VERSIONS.terms})`;
    let lastSendAt = 0;

    for (const row of rows) {
      const to = row.email?.trim();
      if (!to) continue;
      if (sent.has(sentMember(row.id))) {
        alreadySent += 1;
        continue;
      }

      const stillOwned = await r.eval<[string, number], number>(
        REFRESH_LOCK_SCRIPT,
        [LOCK_KEY],
        [lockToken, LOCK_TTL_SEC],
      );
      if (stillOwned !== 1) {
        console.warn(
          "[legal-update-notify] lost the run lock; stopping so runs do not overlap",
        );
        aborted = true;
        break;
      }

      let delivered = false;
      for (let attempt = 1; attempt <= RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
        const wait = lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
        if (wait > 0) await sleep(wait);
        lastSendAt = Date.now();
        try {
          await withTimeout(
            sendEmail({
              to,
              subject,
              html,
              idempotencyKey: `legal-update/${LEGAL_UPDATE_NOTIFICATION_KEY}/${row.id}`,
            }),
            SEND_TIMEOUT_MS,
          );
          delivered = true;
          break;
        } catch (err) {
          if (isRateLimited(err) && attempt < RATE_LIMIT_MAX_ATTEMPTS) {
            const backoffMs = Math.max(
              (err.retryAfterSec ?? 0) * 1000,
              RATE_LIMIT_BASE_BACKOFF_MS * 2 ** (attempt - 1),
            );
            await sleep(backoffMs);
            continue;
          }
          console.warn("[legal-update-notify] send failed:", to, err);
          break;
        }
      }

      if (delivered) {
        await r.sadd(SENT_KEY, sentMember(row.id));
        emailsSent += 1;
      } else {
        emailsFailed += 1;
      }
    }

    await r.expire(SENT_KEY, SENT_TTL_SEC);
    if (!aborted && emailsFailed === 0) {
      await r.set(REDIS_KEY, new Date().toISOString());
    }
  } catch (err) {
    aborted = true;
    console.error("[legal-update-notify] run stopped:", err);
  } finally {
    try {
      await r.eval<[string], number>(RELEASE_LOCK_SCRIPT, [LOCK_KEY], [lockToken]);
    } catch {
      // The lock TTL is the fallback.
    }
  }

  const result = { emailsSent, emailsFailed, alreadySent, aborted };
  console.info("[legal-update-notify] run finished", {
    key: LEGAL_UPDATE_NOTIFICATION_KEY,
    ...result,
  });
  return result;
}
