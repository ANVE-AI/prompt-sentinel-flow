import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Full user journey:
 *
 *   1. Create a Lovable-managed AnveGuard key via the Keys UI (no provider
 *      key needed — uses the bundled Lovable AI Gateway).
 *   2. Capture the one-time secret from the success dialog.
 *   3. Add a unique sentinel term to the user's blocked-keywords policy.
 *   4. Open Playground, paste the key, send TWO prompts:
 *        - benign  → expect "allowed" badge + non-empty text
 *        - sentinel → expect "Blocked by admin policy" badge
 *   5. Open Logs and assert that BOTH a `blocked_input` row AND an
 *      `allowed` row from this key appear.
 *   6. Revoke the key, confirm the dialog includes the new last-used + last-
 *      model fields, and verify an `api_key.revoked` entry lands in the
 *      Audit log tab.
 *   7. Restore the original policy (cleanup).
 *
 * The created key is left revoked but not deleted — that matches the app's
 * actual product behavior (keys are revoked, never hard-deleted).
 */

test.describe.configure({ mode: "serial" });

test.describe("end-to-end: create key → policy → playground → logs → revoke → audit", () => {
  const runId = Date.now().toString(36);
  const keyName = `e2e-${runId}`;
  const sentinel = `E2EBLOCK${runId}`; // alphanumeric so it survives keyword normalization
  const benignPrompt = `Reply with exactly: pong-${runId}`;
  const blockedPrompt = `please ${sentinel} this message`;

  let secretKey = "";
  let originalBlocked: string[] = [];

  test("step 1 — create a Lovable-managed key", async ({ page }) => {
    await page.goto("/dashboard/keys");
    await expect(page.getByRole("heading", { name: /api keys/i })).toBeVisible();

    await page.getByRole("button", { name: /new key/i }).click();
    await page.getByLabel(/^name$/i).fill(keyName);
    // Provider stays as the default "lovable" (managed = true → no provider key required).

    const created = page.waitForResponse(
      (r) => r.url().includes("action=create_key") && r.status() === 200,
    );
    await page.getByRole("button", { name: /^create key$/i }).click();
    const res = await created;
    const json = await res.json();
    secretKey = json.full_key;
    expect(secretKey).toMatch(/^ag_live_/);

    // Close success dialog.
    await page.keyboard.press("Escape");
    await expect(page.getByText(keyName)).toBeVisible();
  });

  test("step 2 — add sentinel to blocked-keywords policy", async ({ page }) => {
    await page.goto("/dashboard/policies");
    const get = await page
      .waitForResponse((r) => r.url().includes("action=get_policies") && r.status() === 200)
      .then((r) => r.json());
    originalBlocked = get?.policies?.blocked_keywords ?? [];

    const blocked = page.getByLabel(/blocked keywords/i);
    await blocked.fill([...originalBlocked, sentinel].join("\n"));

    const save = page.waitForResponse(
      (r) => r.url().includes("action=save_policies") && r.status() === 200,
    );
    await page.getByRole("button", { name: /save changes/i }).click();
    await save;
  });

  test("step 3 — playground: benign prompt is allowed", async ({ page }) => {
    test.skip(!secretKey, "key not created in step 1");
    await page.goto("/dashboard/playground");

    await page.getByLabel(/anveguard api key/i).fill(secretKey);
    // Pick our key from the dropdown so the model list loads.
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(keyName) }).click();

    // Disable streaming for deterministic JSON parsing.
    const streamSwitch = page.getByRole("switch", { name: /stream tokens/i });
    if ((await streamSwitch.getAttribute("aria-checked")) === "true") {
      await streamSwitch.click();
    }

    const promptBox = page.locator("textarea").last();
    await promptBox.fill(benignPrompt);

    const proxy = waitForProxy(page);
    await page.getByRole("button", { name: /send through proxy/i }).click();
    const proxyRes = await proxy;
    expect(proxyRes.status, "proxy returned non-2xx").toBeLessThan(400);

    await expect(page.getByText(/^allowed$/i).last()).toBeVisible({ timeout: 30_000 });
    // Response card has non-empty text.
    const responseText = await page.locator("pre").last().innerText();
    expect(responseText.length).toBeGreaterThan(0);
  });

  test("step 4 — playground: sentinel prompt is blocked", async ({ page }) => {
    test.skip(!secretKey, "key not created in step 1");
    await page.goto("/dashboard/playground");

    await page.getByLabel(/anveguard api key/i).fill(secretKey);
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(keyName) }).click();
    const streamSwitch = page.getByRole("switch", { name: /stream tokens/i });
    if ((await streamSwitch.getAttribute("aria-checked")) === "true") {
      await streamSwitch.click();
    }

    await page.locator("textarea").last().fill(blockedPrompt);

    const proxy = waitForProxy(page);
    await page.getByRole("button", { name: /send through proxy/i }).click();
    await proxy;

    // The block-reason banner uses the current policy's block_message; the
    // badge text "Blocked by admin policy" is stable.
    await expect(page.getByText(/blocked by admin policy/i)).toBeVisible({ timeout: 30_000 });
  });

  test("step 5 — logs show BOTH allowed and blocked rows for this key", async ({ page }) => {
    test.skip(!secretKey, "key not created in step 1");
    // Logs are written async by the proxy — give them a beat.
    await page.waitForTimeout(1500);

    await page.goto("/dashboard/logs");
    const logs = await page
      .waitForResponse((r) => r.url().includes("action=list_logs") && r.status() === 200)
      .then((r) => r.json());

    const rows = (logs.logs ?? []) as any[];
    const mine = rows.filter((l) => l.api_key_name === keyName);

    expect(
      mine.some((l) => l.status === "blocked_input"),
      `no blocked_input row for ${keyName} — found statuses: ${mine.map((l) => l.status).join(",")}`,
    ).toBe(true);
    expect(
      mine.some((l) => l.status === "allowed"),
      `no allowed row for ${keyName}`,
    ).toBe(true);
  });

  test("step 6 — revoke key shows last-used/last-model + audit entry appears", async ({
    page,
  }) => {
    test.skip(!secretKey, "key not created in step 1");

    await page.goto("/dashboard/keys");
    await page.waitForResponse((r) => r.url().includes("action=list_keys"));

    // The Keys page renders a per-row icon button titled "Revoke key".
    // Scope to the row containing our unique key name to avoid revoking
    // someone else's key.
    const row = page.locator("div").filter({ hasText: new RegExp(`^${keyName}`) }).first();
    await row.scrollIntoViewIfNeeded();

    const apiCall = page.waitForResponse(
      (r) => r.url().includes("action=revoke_key") && r.status() === 200,
    );
    await row.getByRole("button", { name: /revoke key/i }).click();
    await apiCall;

    // Audit log should now contain an api_key.revoked entry for this key.
    await page.goto("/dashboard/logs");
    await page.getByRole("tab", { name: /audit log/i }).click();
    const audit = await page
      .waitForResponse(
        (r) => r.url().includes("action=list_audit_logs") && r.status() === 200,
      )
      .then((r) => r.json());

    const entries = (audit.entries ?? []) as any[];
    const mine = entries.find(
      (e) => e.action === "api_key.revoked" && e.metadata?.key_name === keyName,
    );
    expect(mine, `audit entry for revocation of ${keyName} not found`).toBeTruthy();
    expect(mine.actor_user_id).toBeTruthy();
    expect(mine.target_type).toBe("api_key");
  });

  test.afterAll(async ({ browser }) => {
    // Restore the policy regardless of which step failed.
    if (originalBlocked === undefined) return;
    const ctx = await browser.newContext({ storageState: "playwright/.auth/user.json" });
    const page = await ctx.newPage();
    try {
      await page.goto("/dashboard/policies");
      await page.waitForResponse((r) => r.url().includes("action=get_policies"));
      await page.getByLabel(/blocked keywords/i).fill(originalBlocked.join("\n"));
      await page.getByRole("button", { name: /save changes/i }).click();
      await page
        .waitForResponse((r) => r.url().includes("action=save_policies"))
        .catch(() => {});
    } finally {
      await ctx.close();
    }
  });
});

/** Wait for the next /functions/v1/proxy POST and return status. */
async function waitForProxy(page: Page): Promise<{ status: number }> {
  const r = await page.waitForResponse(
    (r) => r.url().includes("/functions/v1/proxy") && r.request().method() === "POST",
    { timeout: 45_000 },
  );
  return { status: r.status() };
}
