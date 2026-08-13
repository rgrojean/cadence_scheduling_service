import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgres://cadence:cadence@localhost:5433/cadence",
      PIS_URL: process.env.PIS_URL ?? "http://localhost:4110",
      MESSAGING_GATEWAY_URL:
        process.env.MESSAGING_GATEWAY_URL ?? "http://localhost:5100",
    },
  },
});
