import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["server/test/**/*.test.ts", "client/src/**/*.test.tsx"],
    setupFiles: ["client/src/test-setup.ts"]
  }
});
