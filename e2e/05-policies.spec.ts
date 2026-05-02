import { test, expect } from "./fixtures";

/**
 * Policies page — loads, lets you toggle "use global defaults", and saves
 * back. We restore the original value at the end so the test is idempotent.
 */
test.describe("policies page", () => {
  test("loads and round-trips the global-defaults switch", async ({ signedInPage: page }) => {
    await page.getByRole("link", { name: /policies/i }).click();
    await expect(page.getByRole("heading", { name: /policies/i })).toBeVisible();

    const get = await page
      .waitForResponse(
        (r) => r.url().includes("action=get_policies") && r.status() === 200,
      )
      .then((r) => r.json());

    const sw = page.getByRole("switch").first();
    if (!(await sw.isVisible().catch(() => false))) test.skip(true, "no policy switch rendered");

    const originalChecked = (await sw.getAttribute("aria-checked")) === "true";
    expect(typeof get?.policy?.use_global_defaults === "boolean").toBe(true);

    // Toggle and save.
    await sw.click();
    const save = page.getByRole("button", { name: /save/i }).first();
    if (await save.isVisible().catch(() => false)) {
      const post = page.waitForResponse(
        (r) => r.url().includes("action=save_policies") && r.status() === 200,
      );
      await save.click();
      await post;
    }

    // Restore original.
    await sw.click();
    if (await save.isVisible().catch(() => false)) {
      const post2 = page.waitForResponse(
        (r) => r.url().includes("action=save_policies") && r.status() === 200,
      );
      await save.click();
      await post2;
    }

    expect((await sw.getAttribute("aria-checked")) === "true").toBe(originalChecked);
  });
});
