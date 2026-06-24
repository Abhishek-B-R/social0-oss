import { auth } from "./auth.js";

export async function getSessionFromRequest(request: {
  headers: Record<string, unknown>;
}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, String(value));
    }
  }
  return auth.api.getSession({ headers });
}
