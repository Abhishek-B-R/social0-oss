import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Social0 API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;

export async function registerDocsRoutes(app: FastifyInstance) {
  const specPath = resolve(__dirname, "../../openapi/openapi.json");

  app.get("/openapi.json", async (_request, reply) => {
    const spec = readFileSync(specPath, "utf8");
    return reply
      .header(
        "Link",
        '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
      )
      .type("application/json")
      .send(spec);
  });

  app.get("/docs", async (_request, reply) => {
    return reply.type("text/html").send(SWAGGER_HTML);
  });
}
