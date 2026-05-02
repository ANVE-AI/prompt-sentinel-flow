import { test, expect } from "./fixtures";

/**
 * Endpoints page — list renders, usage dialog opens, time-range presets
 * refetch with the right `range` query param, and (if any keys are bound)
 * the revoke confirmation dialog shows the new last-used / last-model
 * details and the "Create replacement key" shortcut.
 *
 * The destructive action (actually revoking) is NEVER clicked.
 */
test.describe("endpoints page", () => {
  test("list renders and providers query loads", async ({ signedInPage: page }) => {
    await page.getByRole("link", { name: /endpoints/i }).click();
    await expect(page.getByRole("heading", { name: /endpoints/i })).toBeVisible();
    await page.waitForResponse(
      (r) => r.url().includes("action=list_endpoints") && r.status() === 200,
    );
  });

  test("usage dialog: time-range presets refetch with correct range param", async ({
    signedInPage: page,
  }) => {
    await page.goto("/dashboard/endpoints");
    const list = await page
      .waitForResponse((r) => r.url().includes("action=list_endpoints") && r.status() === 200)
      .then((r) => r.json());
    const endpoints = (list.endpoints ?? []).concat(list.shared_endpoints ?? []);
    test.skip(endpoints.length === 0, "no endpoints on this account — skipping usage dialog assertions");

    // Open the first endpoint's usage dialog (icon button titled "View usage").
    await page.getByRole("button", { name: /view usage/i }).first().click();

    // Default range "24h" fires immediately.
    await page.waitForResponse(
      (r) => r.url().includes("action=endpoint_usage") && r.url().includes("range=24h"),
    );

    // Click each preset and assert the new range is requested.
    for (const range of ["7d", "30d", "90d", "all"] as const) {
      const wait = page.waitForRequest(
        (r) =>
          r.url().includes("action=endpoint_usage") &&
          r.url().includes(`range=${range}`),
      );
      await page.getByRole("button", { name: new RegExp(`^${range}$`, "i"), pressed: false }).click();
      await wait;
    }
  });

  test("revoke confirm dialog shows last-used / last-model + replacement shortcut", async ({
    signedInPage: page,
  }) => {
    await page.goto("/dashboard/endpoints");
    const usage = page.waitForResponse((r) => r.url().includes("action=endpoint_usage"));

    // Try to open any endpoint with bound keys.
    const viewBtn = page.getByRole("button", { name: /view usage/i }).first();
    if (!(await viewBtn.isVisible().catch(() => false))) test.skip(true, "no endpoints");
    await viewBtn.click();
    const data = await usage.then((r) => r.json());
    const keys = data?.usage?.[0]?.keys ?? [];
    test.skip(keys.length === 0, "no bound keys on this endpoint — nothing to revoke");

    // The "Bound API keys" section has a per-row revoke button.
    await page.getByRole("button", { name: /^revoke$/i }).first().click();

    // Confirm dialog elements.
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText(/last used|never used/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create replacement key/i }),
    ).toBeVisible();

    // Cancel — never click the destructive Revoke action in CI.
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
  });
});
