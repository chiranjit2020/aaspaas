import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Loaded here (not just in global-setup) so `webServer`'s spawned `next
// start` process inherits MONGODB_URI/JWT_ACCESS_SECRET/etc. too — that
// child process is a separate app instance, not the test runner.
loadEnv({ path: path.resolve(__dirname, ".env.test") });

const PORT = 3000;
const baseURL = process.env.APP_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false, // specs share one seeded database
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start",
    url: `${baseURL}/api/health`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: process.env as Record<string, string>,
  },
});
