import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const isBuild = process.env.NODE_ENV === "production";

const rawPort = process.env.PORT;
if (!isBuild && !rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}
const port = Number(rawPort || "5000");
if (!isBuild && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

/** Serve index.html for any path that is not an API call, a Vite internal,
 *  or a static asset. This enables React Router's History API in both
 *  dev (`vite dev`) and preview (`vite preview`) modes.
 *
 *  Extension detection: inspect the last path segment before any query/hash.
 *  If it contains a dot (e.g. main.js, logo.png, site.webmanifest) it is
 *  treated as an asset and left alone. Dotless segments (e.g. /disputes,
 *  /rejected-drivers) are SPA routes and get index.html. */
function spaFallback(): import("vite").Plugin {
  function rewrite(req: { url?: string }) {
    const url = req.url ?? "";
    if (url.startsWith("/api") || url.startsWith("/@") || url.startsWith("/__")) return;
    const lastSegment = url.split("?")[0].split("/").pop() ?? "";
    if (!lastSegment.includes(".")) {
      req.url = "/index.html";
    }
  }
  return {
    name: "spa-history-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => { rewrite(req); next(); });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => { rewrite(req); next(); });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    spaFallback(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
