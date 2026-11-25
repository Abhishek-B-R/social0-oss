// After a deploy: tell search engines about new pages.
//   npm run indexnow                 → submit sitemap URLs not submitted before
//   npm run indexnow -- <url> ...    → also resubmit these (pages you changed)
//   npm run indexnow -- --all        → resubmit every sitemap URL
// IndexNow reaches Bing, Yandex, Seznam, Naver and others. Google doesn't use it:
// resubmit the sitemap and request indexing for the printed URLs in Search Console.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://social0.app";
const stateFile = path.join(root, "scripts/indexnow-submitted.json");
const keyFile = fs.readdirSync(path.join(root, "public")).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("No IndexNow key file (public/<32 hex>.txt).");
const key = keyFile.replace(".txt", "");

const args = process.argv.slice(2);
const all = args.includes("--all");
const extra = args.filter((a) => a.startsWith("http"));

const live = await fetch(`${SITE}/${keyFile}`).then((r) => r.text()).catch(() => "");
if (live.trim() !== key) throw new Error(`Key file isn't live at ${SITE}/${keyFile}; deploy first.`);

const xml = await fetch(`${SITE}/sitemap.xml`).then((r) => r.text());
const sitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const done = new Set(fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : []);
const fresh = sitemap.filter((u) => all || !done.has(u));
const urls = [...new Set([...fresh, ...extra])];
if (urls.length === 0) {
  console.log("Nothing new to submit.");
  process.exit(0);
}

// Only submit pages that actually load.
const ok = [];
for (const u of urls) {
  const res = await fetch(u, { method: "GET", redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (compatible; bingbot/2.0)" } });
  if (res.status === 200) ok.push(u);
  else console.warn(`skip ${res.status} ${u}`);
}
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${keyFile}`, urlList: ok }),
});
if (res.status !== 200 && res.status !== 202) throw new Error(`IndexNow answered ${res.status}: ${await res.text()}`);
const newOnes = ok.filter((u) => !done.has(u));
for (const u of ok) done.add(u);
fs.writeFileSync(stateFile, `${JSON.stringify([...done].sort(), null, 2)}\n`);
console.log(`IndexNow ${res.status}: submitted ${ok.length} URL(s).`);
console.log("Now in Google Search Console: resubmit the sitemap, then request indexing (about 6 a day) for:");
for (const u of newOnes.length ? newOnes : ok) console.log(`  ${u}`);
