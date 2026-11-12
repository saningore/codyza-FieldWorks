import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

function loadDotEnv() {
  try {
    const text = readFileSync(path.resolve(__dirname, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
    }
  } catch {
    // Local Docker defaults below are enough when .env is absent.
  }
}

loadDotEnv();

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL || "postgres://fieldworks_app:fieldworks_app@localhost:54332/fieldworks",
      DATABASE_URL_ADMIN: process.env.DATABASE_URL_ADMIN || "postgres://fieldworks:fieldworks@localhost:54332/fieldworks",
      SESSION_PEPPER: process.env.SESSION_PEPPER || "local-session-pepper-change-me",
      CRON_SECRET: process.env.CRON_SECRET || "local-cron-secret-change-me",
      FILE_SIGNING_KEY: process.env.FILE_SIGNING_KEY || "local-file-key-change-me",
    },
  },
});
