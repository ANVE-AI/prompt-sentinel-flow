import { test as base, expect, type Page } from "@playwright/test";

/**
 * Shared fixtures + helpers for dashboard E2E.
 *
 * `signedInPage` simply asserts that the storageState carried us past the
 * Clerk gate. If you see RedirectToSignIn here, your storageState is stale
 * or missing — re-run the auth flow (see playwright.config.ts header).
 */
export const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, use) => {
    await page.goto("/dashboard");

    // If Clerk redirects to /sign-in, fail fast with an actionable message.
    await page.waitForLoadState("domcontentloaded");
    if (/\/sign-in/.test(page.url())) {
      throw new Error(
        "Not signed in. Refresh storageState: " +
          "`npx playwright codegen $E2E_BASE_URL --save-storage=playwright/.auth/user.json` " +
          "or set E2E_CLERK_USER/E2E_CLERK_PASSWORD and run `npm run e2e:auth`.",
      );
    }

    await expect(
      page.getByRole("heading", { name: /overview/i }),
    ).toBeVisible({ timeout: 20_000 });

    await use(page);
  },
});

export { expect };

/** Click a sidebar nav link by its visible label. */
export async function navTo(page: Page, label: RegExp | string) {
  await page.getByRole("link", { name: label }).click();
}
