import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const againstRemote = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 20000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: againstRemote
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3100/api/health/live",
        reuseExistingServer: true,
        timeout: 120000,
      },
  projects: [
    { name: "desktop", grepInvert: /@mobile/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", grep: /@mobile/, use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
});
