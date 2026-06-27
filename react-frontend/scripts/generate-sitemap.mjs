import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public");
const base = (process.env.VITE_APP_URL ?? "https://social0.app").replace(/\/$/, "");
const PSEO_PAGES_ENABLED = false;

const now = new Date().toISOString();

/** @type {{ loc: string; changefreq: string; priority: string }[]} */
const entries = [
  { loc: base, changefreq: "weekly", priority: "1.0" },
  { loc: `${base}/privacy`, changefreq: "monthly", priority: "0.3" },
  { loc: `${base}/terms`, changefreq: "monthly", priority: "0.3" },
  { loc: `${base}/data-deletion`, changefreq: "monthly", priority: "0.2" },
];

if (PSEO_PAGES_ENABLED) {
  entries.push(
    { loc: `${base}/features`, changefreq: "weekly", priority: "0.8" },
    { loc: `${base}/alternatives`, changefreq: "weekly", priority: "0.8" },
  );
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "sitemap.xml"), xml);
console.log(`Wrote sitemap.xml with ${entries.length} URLs`);
