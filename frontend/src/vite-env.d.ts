/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_DOCS_URL?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_CANNY_BOARD_TOKEN?: string;
  readonly VITE_DODO_PAYMENTS_STARTER_PRODUCT_ID?: string;
  readonly VITE_DODO_PAYMENTS_GROWTH_PRODUCT_ID?: string;
  readonly VITE_DODO_PAYMENTS_PRO_PRODUCT_ID?: string;
  readonly VITE_APP_BUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
