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
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": `http://localhost:${backendPort}`
    }
  }
});
