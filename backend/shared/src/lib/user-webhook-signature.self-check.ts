import { assertSocial0WebhookSignatureRoundTrip } from "./user-webhook-signature.js";

await assertSocial0WebhookSignatureRoundTrip();
console.log("social0 webhook signature self-check ok");
