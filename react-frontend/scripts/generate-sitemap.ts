import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALTERNATIVE_SLUGS } from "../src/lib/content/alternatives";
import { FEATURE_SLUGS } from "../src/lib/content/features";
import { PSEO_PAGES_ENABLED } from "../src/lib/content/pseo-enabled";
import { generateLlmsTxt } from "../src/lib/content/llms";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public");
const base = (process.env.VITE_APP_URL ?? "https://social0.app").replace(/\/$/, "");
const now = new Date().toISOString();

const entries: Array<{
  loc: string;
  changefreq: string;
  priority: string;
}> = [
  { loc: base, changefreq: "weekly", priority: "1.0" },
  { loc: `${base}/privacy`, changefreq: "monthly", priority: "0.3" },
  { loc: `${base}/terms`, changefreq: "monthly", priority: "0.3" },
  { loc: `${base}/data-deletion`, changefreq: "monthly", priority: "0.2" },
  { loc: `${base}/llms.txt`, changefreq: "weekly", priority: "0.4" },
];

if (PSEO_PAGES_ENABLED) {
  entries.push(
    { loc: `${base}/features`, changefreq: "weekly", priority: "0.8" },
    { loc: `${base}/alternatives`, changefreq: "weekly", priority: "0.8" },
  );
  for (const slug of FEATURE_SLUGS) {
    entries.push({
      loc: `${base}/features/${slug}`,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const slug of ALTERNATIVE_SLUGS) {
    entries.push({
      loc: `${base}/alternatives/${slug}`,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
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
fs.writeFileSync(path.join(outDir, "llms.txt"), generateLlmsTxt());
console.log(`Wrote sitemap.xml (${entries.length} URLs) and llms.txt`);
