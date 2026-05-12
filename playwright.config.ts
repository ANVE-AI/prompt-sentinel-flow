import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

/**
 * Playwright config for AnveGuard dashboard E2E tests.
 *
 * Auth strategies (pick one — tests work with either):
 *
 *   1. Manual storageState (recommended for Clerk dev instances with bot
 *      detection). Run once:
 *        npx playwright codegen <BASE_URL> --save-storage=playwright/.auth/user.json
 *      …sign in interactively, close the window. Subsequent `npm run e2e`
 *      runs will reuse that session via the project's `storageState`.
 *
 *   2. Programmatic sign-in via @clerk/testing. Set in .env.e2e:
 *        E2E_BASE_URL=https://your-deployment.example.com
 *        E2E_CLERK_USER=<email>
 *        E2E_CLERK_PASSWORD=<password>
 *      Then `npm run e2e:auth` runs the global setup which creates the
 *      storage state file automatically.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Optional setup project — runs only when E2E_CLERK_USER is set.
    ...(process.env.E2E_CLERK_USER
      ? [
          {
            name: "setup",
            testMatch: /global\.setup\.ts/,
          },
        ]
      : []),
    {
      name: "chromium",
      dependencies: process.env.E2E_CLERK_USER ? ["setup"] : [],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
});
