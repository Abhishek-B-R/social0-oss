import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { LinkedProjectConfig } from "../types/index.js";

const PROJECT_FILE = ".social0";

export function findProjectConfig(startDir = process.cwd()): LinkedProjectConfig | null {
  let dir = startDir;
  while (true) {
    const path = join(dir, PROJECT_FILE);
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf8")) as LinkedProjectConfig;
      } catch {
        return null;
      }
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function writeProjectConfig(config: LinkedProjectConfig, dir = process.cwd()): void {
  writeFileSync(join(dir, PROJECT_FILE), JSON.stringify(config, null, 2) + "\n");
}

export function getProjectFilePath(dir = process.cwd()): string {
  return join(dir, PROJECT_FILE);
}
