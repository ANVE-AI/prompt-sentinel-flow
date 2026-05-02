import { test, expect, navTo } from "./fixtures";

/**
 * Smoke navigation: every sidebar route loads its own H1 without throwing.
 * If any of these regress (e.g. a routing guard misconfig, a query crash on
 * mount), this catches it before more specific assertions run.
 */
test.describe("dashboard navigation", () => {
  test("loads every sidebar page", async ({ signedInPage: page }) => {
    await navTo(page, /api keys/i);
    await expect(page.getByRole("heading", { name: /api keys/i })).toBeVisible();

    await navTo(page, /endpoints/i);
    await expect(page.getByRole("heading", { name: /endpoints/i })).toBeVisible();

    await navTo(page, /policies/i);
    await expect(page.getByRole("heading", { name: /policies/i })).toBeVisible();

    await navTo(page, /logs/i);
    await expect(page.getByRole("heading", { name: /logs/i })).toBeVisible();

    await navTo(page, /playground/i);
    await expect(page.getByRole("heading", { name: /playground/i })).toBeVisible();

    await navTo(page, /overview/i);
    await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
  });

  test("no console errors during navigation", async ({ signedInPage: page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    for (const label of [/api keys/i, /endpoints/i, /policies/i, /logs/i, /playground/i, /overview/i]) {
      await navTo(page, label);
      // Tiny settle so any in-flight query rejections surface.
      await page.waitForLoadState("networkidle").catch(() => {});
    }

    // Filter out known-noisy clerk dev warnings.
    const real = errors.filter(
      (e) =>
        !/clerk has been loaded with development keys/i.test(e) &&
        !/redirecturl.*deprecated/i.test(e) &&
        !/RESET_BLANK_CHECK/i.test(e),
    );
    expect(real, real.join("\n")).toEqual([]);
  });
});
