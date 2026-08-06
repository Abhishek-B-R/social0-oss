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

export function getDodoProductId(
  tier: "starter" | "growth" | "pro" | "max",
  interval: "monthly" | "yearly" = "monthly",
): string {
  if (interval === "yearly") {
    if (tier === "starter") {
      return (
        import.meta.env.VITE_DODO_PAYMENTS_STARTER_YEARLY_PRODUCT_ID ??
        import.meta.env.VITE_DODO_PAYMENTS_LITE_YEARLY_PRODUCT_ID ??
        ""
      );
    }
    if (tier === "growth") {
      return import.meta.env.VITE_DODO_PAYMENTS_GROWTH_YEARLY_PRODUCT_ID ?? "";
    }
    if (tier === "max") {
      return import.meta.env.VITE_DODO_PAYMENTS_MAX_YEARLY_PRODUCT_ID ?? "";
    }
    return import.meta.env.VITE_DODO_PAYMENTS_PRO_YEARLY_PRODUCT_ID ?? "";
  }
  const key = (
    {
      starter: "VITE_DODO_PAYMENTS_STARTER_PRODUCT_ID",
      growth: "VITE_DODO_PAYMENTS_GROWTH_PRODUCT_ID",
      pro: "VITE_DODO_PAYMENTS_PRO_PRODUCT_ID",
      max: "VITE_DODO_PAYMENTS_MAX_PRODUCT_ID",
    } as const
  )[tier];
  return import.meta.env[key] ?? "";
}

export const isDev = import.meta.env.DEV;
