/**
 * Renders the landing page to HTML at build time and writes it to
 * functions/landing-prerender.generated.json. functions/_middleware.ts puts it
 * inside #root for "/", so the hero is painted from HTML instead of waiting
 * for the JS bundle (mobile LCP). Run after `vite build` so asset URLs exist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "node_modules/.cache/landing-ssr");

await build({
  root,
  configFile: path.join(root, "vite.config.ts"),
  logLevel: "warn",
  build: {
    ssr: path.join(root, "src/ssr/landing-entry.tsx"),
    outDir,
    emptyOutDir: true,
    rollupOptions: { output: { format: "esm", entryFileNames: "landing-entry.mjs" } },
  },
  ssr: { noExternal: true },
});

const mod = await import(pathToFileURL(path.join(outDir, "landing-entry.mjs")).href);
const html = mod.renderLanding();

// Every local asset the markup references must exist in the client build.
const dist = path.join(root, "dist");
const missing = [...html.matchAll(/(?:src|href|poster)="(\/assets\/[^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => !fs.existsSync(path.join(dist, p)));
if (missing.length) {
  throw new Error(`prerender-landing: assets missing from dist: ${missing.join(", ")}`);
}
if (!html.includes("<h1")) throw new Error("prerender-landing: no <h1> in landing HTML");

const target = path.join(root, "functions/landing-prerender.generated.json");
fs.writeFileSync(target, JSON.stringify({ html }) + "\n");
console.log(`prerender-landing: ${Math.round(html.length / 1024)} KB -> ${path.relative(root, target)}`);
