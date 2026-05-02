import { test, expect } from "./fixtures";

/**
 * Keys page — list renders and the "New key" dialog opens with provider
 * picker. Does NOT actually create a key (would dirty the user's account
 * and require provider credentials).
 */
test.describe("api keys page", () => {
  test("renders list and opens create dialog", async ({ signedInPage: page }) => {
    await page.getByRole("link", { name: /api keys/i }).click();
    await expect(page.getByRole("heading", { name: /api keys/i })).toBeVisible();

    // Wait for the keys list query to settle.
    await page.waitForResponse(
      (r) => r.url().includes("/functions/v1/dashboard") && r.url().includes("action=list_keys"),
    );

    await page.getByRole("button", { name: /new key/i }).click();
    await expect(page.getByRole("heading", { name: /create a new api key/i })).toBeVisible();
    await expect(page.getByLabel(/^name$/i)).toBeVisible();
    await expect(page.getByText(/^provider$/i)).toBeVisible();

    // Cancel.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: /create a new api key/i })).not.toBeVisible();
  });

  test("replacement-key deep link prefills name and shows banner", async ({
    signedInPage: page,
  }) => {
    // Synthetic deep link — exercises the useSearchParams handler in Keys.tsx.
    await page.goto(
      "/dashboard/keys?new=1&name=my-prod-key%20(replacement)&endpoint=00000000-0000-0000-0000-000000000000",
    );

    await expect(page.getByRole("heading", { name: /create a new api key/i })).toBeVisible();
    await expect(page.getByLabel(/^name$/i)).toHaveValue("my-prod-key (replacement)");
    await expect(page.getByText(/replacement key/i)).toBeVisible();
    await expect(page.getByText(/bound to the same endpoint/i)).toBeVisible();

    // URL should be cleaned up after the dialog opens.
    await expect.poll(() => new URL(page.url()).search).not.toContain("new=1");
  });
});
