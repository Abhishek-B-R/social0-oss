import fs from "node:fs";
import path from "node:path";
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

  return {
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.VITE_CANNY_BOARD_TOKEN": JSON.stringify(cannyBoardToken),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "next/link": path.resolve(__dirname, "./src/shims/next-link.tsx"),
        "next/navigation": path.resolve(
          __dirname,
          "./src/shims/next-navigation.ts",
        ),
        "next/image": path.resolve(__dirname, "./src/shims/next-image.tsx"),
        "next/font/google": path.resolve(__dirname, "./src/shims/next-font.ts"),
        "next": path.resolve(__dirname, "./src/shims/next.ts"),
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
