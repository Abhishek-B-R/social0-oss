const DEFAULT_APP_URL = "https://social0.app";
const DEFAULT_API_URL = "https://api.social0.app";
const DEFAULT_DOCS_URL = "https://docs.social0.app";

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
  if (configured) return configured;
  if (import.meta.env.PROD) return DEFAULT_API_URL;
  return "";
}

/** Absolute or same-origin path to a backend /api or /v1 route. */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}

/** Better Auth API origin. Dev: same-origin + Vite /api proxy. Prod: always api.social0.app. */
export function getAuthBaseUrl(): string {
  const api = getApiBaseUrl().replace(/\/$/, "");
  if (api) return api;
  if (import.meta.env.PROD) return DEFAULT_API_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return DEFAULT_API_URL;
}

export function getAppUrl(): string {
  const configured = import.meta.env.VITE_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return DEFAULT_APP_URL;
}

export function getDocsUrl(): string {
  return import.meta.env.VITE_DOCS_URL?.replace(/\/$/, "") ?? DEFAULT_DOCS_URL;
}

export function getCannyBoardToken(): string {
  return import.meta.env.VITE_CANNY_BOARD_TOKEN ?? "";
}

