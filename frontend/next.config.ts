import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const appRoot = path.resolve(rootDir);

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["react-icons"],
  },
  // Same root for tracing and Turbopack so the build warning is avoided (Next.js requires both to match).
  outputFileTracingRoot: appRoot,
  // Pin resolution root to this app (frontend) so Tailwind and deps resolve from frontend/node_modules
  // even when multiple lockfiles exist (e.g. package-lock.json in home or repo root).
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
