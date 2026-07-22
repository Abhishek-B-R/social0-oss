import fs from "node:fs";
import path from "node:path";
import transformImports from "@rolldown/plugin-transform-imports";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function loadDevHttpsCerts():
  | { key: Buffer; cert: Buffer }
  | undefined {
  const certDirs = [
    path.resolve(__dirname, "../backend/certificates"),
    path.resolve(__dirname, "./certificates"),
    path.resolve(__dirname, "../frontend/certificates"),
  ];
  const fileSets: [string, string][] = [
    ["localhost-key.pem", "localhost.pem"],
    ["key.pem", "cert.pem"],
  ];

  for (const dir of certDirs) {
    for (const [keyFile, certFile] of fileSets) {
      const keyPath = path.join(dir, keyFile);
      const certPath = path.join(dir, certFile);
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
      }
    }
  }

  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const httpsCerts = loadDevHttpsCerts();
  const defaultApiTarget = httpsCerts
    ? "https://localhost:3001"
    : "http://localhost:3001";
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET || env.VITE_API_URL || defaultApiTarget;
  const useHttps = Boolean(httpsCerts);
  const cannyBoardToken =
    env.VITE_CANNY_BOARD_TOKEN || env.NEXT_PUBLIC_CANNY_BOARD_TOKEN || "";
  // Prefer CI-injected process.env — loadEnv only reads .env files.
  const appBuildId =
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    env.CF_PAGES_COMMIT_SHA ||
    env.GITHUB_SHA ||
    env.VERCEL_GIT_COMMIT_SHA ||
    `${Date.now()}`;

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Avoid resolving the 6k-export @tabler/icons-react barrel on every build.
      transformImports({
        "@tabler/icons-react": {
          transform: "@tabler/icons-react/dist/esm/icons/{{member}}",
          preventFullImport: true,
        },
      }),
    ],
    define: {
      "import.meta.env.VITE_CANNY_BOARD_TOKEN": JSON.stringify(cannyBoardToken),
      "import.meta.env.VITE_APP_BUILD_ID": JSON.stringify(appBuildId),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      modulePreload: {
        resolveDependencies: (_filename, deps) =>
          deps.filter(
            (dep) =>
              !dep.includes("/motion-") &&
              !dep.includes("/posthog-") &&
              !dep.includes("framer-motion"),
          ),
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            // Keep framer-motion with FlowAnimation — a shared "motion" chunk
            // gets modulepreloaded on every landing visit and tanks mobile LCP.
            if (id.includes("posthog")) return "posthog";
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/") ||
              id.includes("react-router")
            ) {
              return "react-vendor";
            }
            if (id.includes("@tanstack/react-query")) return "query";
            if (id.includes("better-auth")) return "auth";
          },
        },
      },
    },
    server: {
      host: true,
      port: 3000,
      strictPort: true,
      https: httpsCerts,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              if (req.headers.host) {
                proxyReq.setHeader("x-forwarded-host", req.headers.host);
              }
              proxyReq.setHeader("x-forwarded-proto", useHttps ? "https" : "http");
            });
          },
        },
        "/v1": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              if (req.headers.host) {
                proxyReq.setHeader("x-forwarded-host", req.headers.host);
              }
              proxyReq.setHeader("x-forwarded-proto", useHttps ? "https" : "http");
            });
          },
        },
      },
    },
  };
});
