import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/llm/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 200_000,
    hookTimeout: 60_000,
  },
});
