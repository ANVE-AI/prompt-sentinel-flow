import { test as setup, expect } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import path from "node:path";
import fs from "node:fs";

const authFile = path.join(process.cwd(), "playwright/.auth/user.json");

/**
 * Programmatic Clerk sign-in. Runs once before the test suite when
 * E2E_CLERK_USER/E2E_CLERK_PASSWORD are provided. Persists the session to
 * `playwright/.auth/user.json` so test workers can reuse it.
 *
 * If you're on a Clerk *dev* instance that triggers bot detection on
 * programmatic sign-in, use the manual storageState approach instead
 * (see playwright.config.ts header).
 */
setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await clerkSetup();

  const baseURL = process.env.E2E_BASE_URL!;
  await page.goto(baseURL + "/sign-in");

  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER!,
      password: process.env.E2E_CLERK_PASSWORD!,
    },
  });

  await page.goto(baseURL + "/dashboard");
  await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible({
    timeout: 20_000,
  });

  await page.context().storageState({ path: authFile });
});
