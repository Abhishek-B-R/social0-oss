import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Three test files sat in `src/` with no runner, so they had never run once.
 * Unit tests only — no jsdom — since what they cover is pure logic.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
