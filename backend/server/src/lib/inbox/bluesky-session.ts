const TTL_MS = 50 * 60 * 1000;

type Cached = {
  accessJwt: string;
  refreshJwt: string | null;
  did: string;
  exp: number;
};

const cache = new Map<string, Cached>();

export function dropBlueskySession(accountId: string): void {
  cache.delete(accountId);
}

function store(
  accountId: string,
  data: { accessJwt: string; refreshJwt?: string; did: string },
): { accessJwt: string; did: string } {
  cache.set(accountId, {
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt ?? null,
    did: data.did,
    exp: Date.now() + TTL_MS,
  });
  return { accessJwt: data.accessJwt, did: data.did };
}

async function refreshSession(
  accountId: string,
  refreshJwt: string,
): Promise<{ accessJwt: string; did: string } | null> {
  const res = await fetch(
    "https://bsky.social/xrpc/com.atproto.server.refreshSession",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshJwt}` },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    accessJwt?: string;
    refreshJwt?: string;
    did?: string;
  };
  if (!res.ok || !data.accessJwt || !data.did) {
    cache.delete(accountId);
    return null;
  }
  return store(accountId, data);
}

async function createSession(
  accountId: string,
  handle: string,
  appPassword: string,
): Promise<{ accessJwt: string; did: string } | null> {
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
    refreshJwt?: string;
    did?: string;
  };
  if (!res.ok || !data.accessJwt || !data.did) return null;
  return store(accountId, data);
}

/** Cached session - refresh JWT when possible; password login is last resort. */
export async function blueskySession(
  accountId: string,
  handle: string,
  appPassword: string,
  opts?: { force?: boolean },
): Promise<{ accessJwt: string; did: string } | null> {
  const cached = cache.get(accountId);
  if (!opts?.force && cached && cached.exp > Date.now()) {
    return { accessJwt: cached.accessJwt, did: cached.did };
  }
  if (cached?.refreshJwt) {
    const refreshed = await refreshSession(accountId, cached.refreshJwt);
    if (refreshed) return refreshed;
  } else if (opts?.force) {
    cache.delete(accountId);
  }
  return createSession(accountId, handle, appPassword);
}

/** Drop a dead access JWT, refresh if possible, otherwise re-login. */
export async function blueskySessionAfter401(
  accountId: string,
  handle: string,
  appPassword: string,
): Promise<{ accessJwt: string; did: string } | null> {
  return blueskySession(accountId, handle, appPassword, { force: true });
}
