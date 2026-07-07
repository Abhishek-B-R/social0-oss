import { apiUrl } from "@/lib/env";

/** fetch to backend API — same-origin + Vite proxy in dev, VITE_API_URL in prod. */
export function fetchApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { credentials: _omit, ...rest } = init ?? {};
  return fetch(apiUrl(path), {
    ...rest,
    credentials: "include",
    headers: init?.headers,
  });
}

export { apiUrl };
