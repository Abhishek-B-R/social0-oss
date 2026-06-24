import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = [
  "server/src/routes/handlers",
  "server/src/lib/billing-guards.ts",
  "server/src/lib/pending-checkout.ts",
  "server/src/lib/webhook-idempotency.ts",
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const files = [];
for (const root of roots) {
  const full = join(process.cwd(), root);
  try {
    if (full.endsWith(".ts")) files.push(full);
    else walk(full, files);
  } catch {
    /* skip */
  }
}

for (const file of files) {
  let s = readFileSync(file, "utf8");
  s = s.replace(
    /from "(\.\.\/[^"]*\/(?:lib|db)\/[^"]+)"(?!\.js)/g,
    'from "$1.js"',
  );
  writeFileSync(file, s);
}

console.log(`fixed ${files.length} files`);
