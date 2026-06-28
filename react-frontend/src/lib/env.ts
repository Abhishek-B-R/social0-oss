const DEFAULT_APP_URL = "https://social0.app";
const DEFAULT_DOCS_URL = "https://docs.social0.app";

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? "";
}

/** Better Auth API origin. Dev: same-origin + Vite /api proxy. Prod: api.social0.app. */
export function getAuthBaseUrl(): string {
  const api = getApiBaseUrl().replace(/\/$/, "");
  if (api) return api;
  if (typeof window !== "undefined") return window.location.origin;
  return "https://api.social0.app";
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

export function getDodoProductId(
  tier: "starter" | "growth" | "pro",
): string {
  const key = {
    starter: "VITE_DODO_PAYMENTS_STARTER_PRODUCT_ID",
    growth: "VITE_DODO_PAYMENTS_GROWTH_PRODUCT_ID",
    pro: "VITE_DODO_PAYMENTS_PRO_PRODUCT_ID",
  }[tier] as keyof ImportMetaEnv;
  return import.meta.env[key] ?? "";
}

export const isDev = import.meta.env.DEV;
