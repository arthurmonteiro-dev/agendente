import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL || "postgresql://agendente:agendente@localhost:5432/agendente_test",
      SESSION_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      ANTHROPIC_API_KEY: "",
    },
  },
});
