import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shim = (f: string) => fileURLToPath(new URL(`./src/navegador/shims/${f}`, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
  // Modo navegador (site estático, ex.: Vercel): o servidor corre dentro da página — ver src/navegador/.
  ...(mode === "navegador"
    ? {
        resolve: {
          alias: {
            express: shim("express.ts"),
            "node:fs": shim("fs.ts"),
            "node:path": shim("path.ts"),
            "node:url": shim("url.ts"),
            "@google/genai": shim("semIA.ts"),
            "@anthropic-ai/sdk": shim("semIA.ts"),
          },
        },
        define: { "process.env": "{}" },
      }
    : {}),
}));
