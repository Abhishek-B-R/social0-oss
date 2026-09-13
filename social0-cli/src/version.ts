import { createRequire } from "node:module";

/**
 * The published version, read from package.json rather than restated.
 *
 * It used to be hardcoded in two places that drifted apart: `--version` said
 * 0.2.0 while `social0 version`, `doctor` and the update check said 0.1.2 — so
 * `social0 update` compared npm's latest against a version nobody was running
 * and offered an upgrade to the release already installed.
 *
 * `rootDir` is `src` and `outDir` is `dist`, so `../package.json` resolves to
 * the package root both from `src/` under tsx and from `dist/` once built.
 */
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version?: string };

export const CLI_VERSION = pkg.version ?? "0.0.0";
