import { test, expect } from "./fixtures";

/**
 * Logs page — request log AND audit log tab end-to-end.
 *
 * Asserts:
 *  - Both tab triggers render and switch the visible panel.
 *  - The audit log fetches via `list_audit_logs` (network call observed) and
 *    renders its column headers.
 *  - The status filter on Requests refetches via `list_logs` with the new
 *    `status` query param.
 *  - Action filter on Audit log refetches with the new `action` query param.
 */
test.describe("logs page", () => {
  test.beforeEach(async ({ signedInPage: page }) => {
    await page.getByRole("link", { name: /logs/i }).click();
    await expect(page.getByRole("heading", { name: /logs/i })).toBeVisible();
  });

  test("requests tab renders and filters by status", async ({ signedInPage: page }) => {
    await expect(page.getByRole("tab", { name: /^requests$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /audit log/i })).toBeVisible();

    // Default tab is Requests — column headers from the requests table.
    await expect(page.getByText(/^prompt$/i)).toBeVisible();
    await expect(page.getByText(/^latency$/i)).toBeVisible();
    await expect(page.getByText(/^tokens$/i)).toBeVisible();

    // Change status filter and assert the dashboard fn is called with the
    // new query param. The select trigger has no name, so locate by the
    // current value text.
    const refetch = page.waitForRequest(
      (r) => r.url().includes("/functions/v1/dashboard") && r.url().includes("status=blocked_input"),
    );
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /blocked \(input\)/i }).click();
    await refetch;
  });

  test("audit log tab loads, filters, and opens detail sheet", async ({ signedInPage: page }) => {
    // Switching to Audit log triggers the list_audit_logs request.
    const auditCall = page.waitForResponse(
      (r) =>
        r.url().includes("/functions/v1/dashboard") &&
        r.url().includes("action=list_audit_logs") &&
        r.status() === 200,
    );
    await page.getByRole("tab", { name: /audit log/i }).click();
    const res = await auditCall;
    const json = await res.json();
    expect(Array.isArray(json.entries)).toBe(true);

    // Audit table headers.
    await expect(page.getByText(/^action$/i).first()).toBeVisible();
    await expect(page.getByText(/^target$/i)).toBeVisible();
    await expect(page.getByText(/^actor$/i)).toBeVisible();

    // Filter by api_key.revoked → another fetch with action=api_key.revoked.
    const filtered = page.waitForRequest(
      (r) =>
        r.url().includes("/functions/v1/dashboard") &&
        r.url().includes("action=api_key.revoked"),
    );
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /api key revoked/i }).click();
    await filtered;

    // If there are entries, click the first one and assert the detail sheet
    // opens with metadata pre-formatted as JSON. Skip when the account has
    // no audit history yet so the test stays useful on fresh tenants.
    const entries = json.entries as any[];
    if (entries.length > 0) {
      // Re-fetch after filter; the row count may change. Click first row.
      const firstRow = page.getByRole("button").filter({ hasText: /api key revoked/i }).first();
      if (await firstRow.isVisible().catch(() => false)) {
        await firstRow.click();
        await expect(page.getByRole("heading", { name: /audit entry/i })).toBeVisible();
        await expect(page.getByText(/metadata/i)).toBeVisible();
        // Close the sheet for cleanup.
        await page.keyboard.press("Escape");
      }
    } else {
      await expect(page.getByText(/no audit entries yet/i)).toBeVisible();
    }
  });
});
