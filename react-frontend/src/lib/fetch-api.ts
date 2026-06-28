import { apiUrl } from "@/lib/env";

/** fetch to backend API — same-origin + Vite proxy in dev, VITE_API_URL in prod. */
export function fetchApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: init?.headers,
  });
}

export { apiUrl };
