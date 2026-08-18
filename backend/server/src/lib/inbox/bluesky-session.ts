const TTL_MS = 50 * 60 * 1000;

const cache = new Map<string, { accessJwt: string; did: string; exp: number }>();

/** Cached `createSession` — Bluesky rate-limits password logins. */
export async function blueskySession(
  accountId: string,
  handle: string,
  appPassword: string,
): Promise<{ accessJwt: string; did: string } | null> {
  const cached = cache.get(accountId);
  if (cached && cached.exp > Date.now()) {
    return { accessJwt: cached.accessJwt, did: cached.did };
  }
  const res = await fetch(
    "https://bsky.social/xrpc/com.atproto.server.createSession",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    accessJwt?: string;
    did?: string;
  };
  if (!res.ok || !data.accessJwt || !data.did) return null;
  cache.set(accountId, {
    accessJwt: data.accessJwt,
    did: data.did,
    exp: Date.now() + TTL_MS,
  });
  return { accessJwt: data.accessJwt, did: data.did };
}
