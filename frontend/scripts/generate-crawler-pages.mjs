/**
 * Renders every blog, feature, tool and alternative route to plain HTML for
 * crawlers (search engines and AI bots that don't run JavaScript) and writes
 * functions/crawler-pages.generated.json. The middleware serves it inside #root;
 * people never see it (index.html hides #prerender and React replaces #root).
 *
 * Content stays single-source: this bundles the same typed modules the SPA uses.
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "node_modules/.cache/crawler-entry.mjs");

await build({
  entryPoints: [path.join(root, "scripts/crawler-entry.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: outFile,
  tsconfig: path.join(root, "tsconfig.app.json"),
  logLevel: "warning",
});

const { buildCrawlerPages } = await import(pathToFileURL(outFile).href);
const pages = buildCrawlerPages();
const target = path.join(root, "functions/crawler-pages.generated.json");
fs.writeFileSync(target, `${JSON.stringify(pages)}\n`);
const kb = Math.round(fs.statSync(target).size / 1024);
console.log(`Wrote crawler pages for ${Object.keys(pages).length} routes (${kb} KB)`);
