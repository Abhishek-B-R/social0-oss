import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { API_CATALOG_LINKSET } from "../lib/api-catalog.js";

const specPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../openapi/openapi.json",
);

describe("OpenAPI typed error model", () => {
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const methods = ["get", "post", "put", "patch", "delete"];

  it("defines Error and ProblemDetails schemas", () => {
    expect(spec.components.schemas.Error.required).toEqual(["error"]);
    expect(spec.components.schemas.Error.properties.error.required).toEqual([
      "code",
      "message",
    ]);
    expect(spec.components.schemas.ProblemDetails.required).toEqual([
      "type",
      "title",
      "status",
      "detail",
    ]);
  });

  it("references typed errors on every 401, 429, and 500", () => {
    const ops: string[] = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const method of methods) {
        const op = (item as Record<string, { responses?: Record<string, unknown> }>)[method];
        if (!op?.responses) continue;
        ops.push(`${method.toUpperCase()} ${path}`);
        for (const status of ["401", "429", "500"]) {
          const response = op.responses[status] as { $ref?: string } | undefined;
          expect(response?.$ref, `${method} ${path} ${status}`).toMatch(
            /#\/components\/responses\/(Error|Unauthorized|RateLimited|ServerError)$/,
          );
        }
      }
    }
    expect(ops.length).toBeGreaterThan(10);
  });
});

describe("api catalog", () => {
  it("points at OpenAPI and developer docs", () => {
    expect(API_CATALOG_LINKSET.linkset[0]["service-desc"][0].href).toBe(
      "https://api.social0.app/openapi.json",
    );
    expect(
      API_CATALOG_LINKSET.linkset[0]["service-doc"].some(
        (link) => link.href === "https://social0.app/auth.md",
      ),
    ).toBe(true);
  });
});
