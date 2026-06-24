const API = import.meta.env.VITE_API_URL ?? "";

export async function rpc<T>(fn: string, ...args: unknown[]): Promise<T> {
  const res = await fetch(`${API}/api/rpc`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn, args }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `RPC ${fn} failed`);
  }
  return res.json() as Promise<T>;
}
