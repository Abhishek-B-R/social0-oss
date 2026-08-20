/** TikTok Business Messaging (organic DMs). Not Login Kit / open.tiktokapis.com. */

export const TIKTOK_BM_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export type TikTokBmEnvelope = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: Record<string, unknown>;
};

export function isTikTokBmOk(
  httpOk: boolean,
  env: TikTokBmEnvelope,
): boolean {
  return httpOk && env.code === 0;
}

export function tiktokBmData(
  env: TikTokBmEnvelope,
): Record<string, unknown> {
  return env.data && typeof env.data === "object" ? env.data : {};
}

export function tiktokBmErrorMessage(
  env: TikTokBmEnvelope,
  fallback: string,
): string {
  const msg = typeof env.message === "string" ? env.message.trim() : "";
  const base = msg || fallback;
  const auth =
    env.code === 40100 ||
    env.code === 40001 ||
    /access.?token|unauthorized|oauth|permission|scope|login kit/i.test(base);
  if (auth) {
    return `${base} TikTok DMs need Business Messaging on business-api.tiktok.com (not Login Kit). Unavailable in US/EEA/UK.`;
  }
  return base;
}

export type TikTokBmConversation = {
  conversation_id?: string;
  update_time?: number;
};

export function tiktokBmConversations(
  data: Record<string, unknown>,
): TikTokBmConversation[] {
  const raw = data.conversations ?? data.conversation_list;
  return Array.isArray(raw) ? (raw as TikTokBmConversation[]) : [];
}

/** True when every conversation-type call failed (not when one type is simply empty). */
export function tiktokBmListFailed(opts: {
  anyOk: boolean;
  lastErr: string | null;
  rowCount: number;
}): boolean {
  return !opts.anyOk && opts.rowCount === 0 && Boolean(opts.lastErr);
}

export function tiktokBmCursor(data: Record<string, unknown>): string | null {
  if (data.has_more !== true && data.has_more !== 1) return null;
  if (data.cursor == null || data.cursor === "") return null;
  return String(data.cursor);
}

export function isTikTokBmOwnMessage(
  message: {
    from_user?: { role?: string; id?: string };
    sender?: string;
  },
  businessId: string,
): boolean {
  const role = message.from_user?.role;
  if (role === "BUSINESS_ACCOUNT" || role === "BUSINESS") return true;
  if (message.from_user?.id && message.from_user.id === businessId) return true;
  const sender = message.sender;
  if (!sender) return false;
  return (
    sender === businessId ||
    sender === "BUSINESS_ACCOUNT" ||
    sender === "BUSINESS"
  );
}

export function tiktokBmMediaId(
  data: Record<string, unknown>,
): string | null {
  return typeof data.media_id === "string" && data.media_id ? data.media_id : null;
}

export function tiktokBmSentMessageId(
  data: Record<string, unknown>,
): string | undefined {
  const nested = data.message;
  if (nested && typeof nested === "object") {
    const id = (nested as { message_id?: unknown }).message_id;
    if (typeof id === "string" && id) return id;
  }
  return typeof data.message_id === "string" ? data.message_id : undefined;
}

const TIKTOK_BM_TIMEOUT_MS = 12_000;

export async function tiktokBmGet(
  accessToken: string,
  path: string,
  query: Record<string, string>,
): Promise<{ ok: boolean; data: TikTokBmEnvelope }> {
  const url = new URL(`${TIKTOK_BM_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "Access-Token": accessToken },
    signal: AbortSignal.timeout(TIKTOK_BM_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as TikTokBmEnvelope;
  return { ok: isTikTokBmOk(res.ok, data), data };
}

export async function tiktokBmPost(
  accessToken: string,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; data: TikTokBmEnvelope }> {
  const res = await fetch(`${TIKTOK_BM_BASE}${path}`, {
    method: "POST",
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIKTOK_BM_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as TikTokBmEnvelope;
  return { ok: isTikTokBmOk(res.ok, data), data };
}

export async function tiktokBmUploadImage(
  accessToken: string,
  businessId: string,
  file: Blob,
  filename: string,
): Promise<{ ok: boolean; data: TikTokBmEnvelope }> {
  const form = new FormData();
  form.append("business_id", businessId);
  form.append("file", file, filename);
  form.append("media_type", "IMAGE");
  const res = await fetch(`${TIKTOK_BM_BASE}/business/message/media/upload/`, {
    method: "POST",
    headers: { "Access-Token": accessToken },
    body: form,
    signal: AbortSignal.timeout(TIKTOK_BM_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as TikTokBmEnvelope;
  return { ok: isTikTokBmOk(res.ok, data), data };
}
