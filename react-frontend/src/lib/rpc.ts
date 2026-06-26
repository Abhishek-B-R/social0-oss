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

import { assignSafeRedirectUrl } from "./safe-external-url";

export async function rpc<T>(fn: string, ...args: unknown[]): Promise<T> {
  const res = await fetch("/api/rpc", {
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
    throw new Error(text || `RPC ${fn} failed`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return undefined as T;
}
