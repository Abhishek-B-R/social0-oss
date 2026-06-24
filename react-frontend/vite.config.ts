import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET || env.VITE_API_URL || "http://localhost:3001";

  return {
    plugins: [react(), tailwindcss()],
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
      port: 5173,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              if (req.headers.host) {
                proxyReq.setHeader("x-forwarded-host", req.headers.host);
              }
              proxyReq.setHeader("x-forwarded-proto", "http");
            });
          },
        },
        "/v1": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
