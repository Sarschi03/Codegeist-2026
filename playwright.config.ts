import { defineConfig } from "@playwright/test";
const port = Number(process.env.TRACE_TEST_PORT ?? 4173);
const baseURL = "http://localhost:" + port;
const forgeMock = process.env.TRACE_TEST_FORGE_MOCK === "true";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: forgeMock ? "forge-flow.spec.ts" : "workspace.spec.ts",
  timeout: 90_000,
  fullyParallel: true,
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run dev -- --port " +
      port +
      " --strictPort" +
      (forgeMock ? " --mode forge" : ""),
    url: baseURL,
    reuseExistingServer: false,
    env: {
      VITE_TRACE_CONVEX:
        process.env.TRACE_TEST_CONVEX === "true" ? "true" : "false",
    },
  },
});
