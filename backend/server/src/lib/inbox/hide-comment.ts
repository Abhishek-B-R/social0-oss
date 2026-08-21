/**
 * Hide a comment on the originating platform (moderation).
 * Instagram: POST /{comment-id}?hide=true
 * Facebook Pages: POST /{comment-id} with is_hidden=true
 */

export type HideCommentInput = {
  platform: string;
  commentId: string;
  accessToken: string;
};

export type HideCommentResult = { ok: true } | { ok: false; error: string };

function fail(message: string): HideCommentResult {
  return { ok: false, error: message };
}

export function inboxCommentHideSupported(platform: string): boolean {
  return platform === "instagram" || platform === "facebook";
}

async function hideInstagram(input: HideCommentInput): Promise<HideCommentResult> {
  const url = `https://graph.instagram.com/v21.0/${encodeURIComponent(input.commentId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      hide: "true",
      access_token: input.accessToken,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    success?: boolean;
  };
  if (!res.ok) {
    return fail(data.error?.message ?? "Instagram hide failed");
  }
  return { ok: true };
}

async function hideFacebook(input: HideCommentInput): Promise<HideCommentResult> {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.commentId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      is_hidden: "true",
      access_token: input.accessToken,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    success?: boolean;
  };
  if (!res.ok) {
    return fail(data.error?.message ?? "Facebook hide failed");
  }
  return { ok: true };
}

export async function hideCommentOnPlatform(
  input: HideCommentInput,
): Promise<HideCommentResult> {
  if (input.platform === "instagram") return hideInstagram(input);
  if (input.platform === "facebook") return hideFacebook(input);
  return fail(`Hiding comments is not supported for ${input.platform}.`);
}
