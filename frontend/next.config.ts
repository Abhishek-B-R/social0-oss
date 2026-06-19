import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const appRoot = path.resolve(rootDir);

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
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
