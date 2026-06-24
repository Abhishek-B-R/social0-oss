/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_AUTH_URL: string;
  readonly VITE_APP_URL: string;
  readonly VITE_TURNSTILE_SITE_KEY: string;
  readonly VITE_CANNY_BOARD_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
