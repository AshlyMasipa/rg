import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // each file gets its own module graph → its own in-memory DB
    isolate: true,
    fileParallelism: false,
  },
});
