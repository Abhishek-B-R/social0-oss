function serializeArg(arg: unknown): unknown {
  if (arg instanceof Date) {
    return { __date: true, value: arg.toISOString() };
  }
  if (arg instanceof FormData) {
    const entries: Record<string, string> = {};
    arg.forEach((value, key) => {
      entries[key] = String(value);
    });
    return { __formData: true, entries };
  }
  return arg;
}

import { toClientErrorMessage } from "./client-error-message";
import { assignSafeRedirectUrl } from "./safe-external-url";
import { fetchApi } from "./fetch-api";

export async function rpc<T>(fn: string, ...args: unknown[]): Promise<T> {
  const res = await fetchApi("/api/rpc", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn, args: args.map(serializeArg) }),
  });

  if (res.redirected) {
    if (!assignSafeRedirectUrl(res.url)) {
      throw new Error("Invalid redirect");
    }
    throw new Error("Redirecting");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(toClientErrorMessage(text, `Request failed (${res.status})`));
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return undefined as T;
}

/**
 * Fire-and-forget RPC that survives the page being unloaded (`keepalive`).
 * Use only from `pagehide` / unload paths where nobody is left to read the
 * result; the body must stay under the browser's 64 KB keepalive limit.
 */
export function rpcKeepalive(fn: string, ...args: unknown[]): void {
  void fetchApi("/api/rpc", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn, args: args.map(serializeArg) }),
  }).catch(() => {
    // The page is going away; there is nothing to report the failure to.
  });
}
