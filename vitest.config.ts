import path from "node:path";
import { defineConfig } from "vitest/config";

/** Testes unitários do licenciamento (shared/, functions/, server/). Não carrega o vite.config.ts do console. */
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "functions/**/*.test.ts", "server/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});
