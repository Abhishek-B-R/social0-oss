import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

async function securityHeadersPlugin(app: FastifyInstance) {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    return payload;
  });
}

/**
 * fp breaks encapsulation so the onSend hook lands on the root instance and
 * reaches every sibling route plugin (/api, /v1, /admin, docs, oauth). A plain
 * `app.register(fn)` would scope it to routes declared inside this plugin: none.
 */
export const registerSecurityHeadersPlugin = fp(securityHeadersPlugin, {
  name: "security-headers",
});
