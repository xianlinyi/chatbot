import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const configPath = path.resolve("agent.config.json");
const agentConfig = JSON.parse(readFileSync(configPath, "utf8")) as { server?: { port?: number } };
const backendPort = Number(process.env.PORT ?? agentConfig.server?.port ?? 3000);

export default defineConfig({
  plugins: [react()],
  root: "client",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("/node_modules/three/")) {
            return "three";
          }

          if (
            id.includes("/node_modules/react-markdown/") ||
            id.includes("/node_modules/remark-gfm/") ||
            id.includes("/node_modules/micromark") ||
            id.includes("/node_modules/mdast-util") ||
            id.includes("/node_modules/hast-util") ||
            id.includes("/node_modules/unified/")
          ) {
            return "markdown";
          }

          return undefined;
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": `http://localhost:${backendPort}`
    }
  }
});
