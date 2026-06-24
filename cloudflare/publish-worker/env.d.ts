/** Secrets / vars set via `wrangler secret put` or `.dev.vars` locally. */
interface Env {
  PUBLISH_HMAC_SECRET: string;
  API_CALLBACK_URL: string;
}
