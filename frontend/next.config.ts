import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["react-icons"],
  },
  // Pin resolution root to this app (frontend) so Tailwind and deps resolve from frontend/node_modules
  // even when multiple lockfiles exist (e.g. package-lock.json in home or repo root).
  turbopack: {
    root: path.resolve(rootDir),
  },
};

export default nextConfig;
