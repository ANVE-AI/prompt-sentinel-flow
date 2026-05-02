import { test, expect } from "./fixtures";

/**
 * Policies — full save / persist / restore lifecycle.
 *
 * 1. Read current policy via `get_policies`.
 * 2. Save a new override that includes a unique sentinel keyword we can
 *    later look for in the playground spec (`E2E_BLOCK_<runId>`).
 * 3. Reload the page and assert the override survived.
 * 4. Restore the original values so the account is left unchanged.
 *
 * The sentinel is also stashed in `process.env.E2E_BLOCK_TERM` for the
 * playground spec, but each spec re-reads policies independently so they
 * remain runnable in isolation.
 */

const sentinel = `E2E_BLOCK_${Date.now().toString(36)}`;

test.describe("policies lifecycle", () => {
  test("save → reload → restore round trip persists overrides", async ({
    signedInPage: page,
  }) => {
    await page.goto("/dashboard/policies");
    await expect(page.getByRole("heading", { name: /policies/i })).toBeVisible();

    const get = await page
      .waitForResponse((r) => r.url().includes("action=get_policies") && r.status() === 200)
      .then((r) => r.json());

    const original = {
      blocked: (get?.policies?.blocked_keywords ?? []) as string[],
      allowed: (get?.policies?.allowed_keywords ?? []) as string[],
      message: get?.policies?.block_message ?? "",
      useDefaults: !!get?.policies?.use_global_defaults,
    };

    // -- Mutation: append sentinel + custom block message ------------------
    const blocked = page.getByLabel(/blocked keywords/i);
    await blocked.click();
    await blocked.fill([...original.blocked, sentinel].join("\n"));

    const msg = page.getByLabel(/block message/i);
    const customMsg = `BLOCKED-BY-E2E-${sentinel}`;
    await msg.fill(customMsg);

    const save1 = page.waitForResponse(
      (r) => r.url().includes("action=save_policies") && r.status() === 200,
    );
    await page.getByRole("button", { name: /save changes/i }).click();
    await save1;
    await expect(page.getByText(/policies saved/i)).toBeVisible();

    // -- Reload & verify persistence --------------------------------------
    await page.reload();
    await page.waitForResponse((r) => r.url().includes("action=get_policies"));
    await expect(page.getByLabel(/blocked keywords/i)).toContainText(sentinel);
    await expect(page.getByLabel(/block message/i)).toHaveValue(customMsg);

    // -- Restore original --------------------------------------------------
    await page.getByLabel(/blocked keywords/i).fill(original.blocked.join("\n"));
    await page.getByLabel(/allowed keywords/i).fill(original.allowed.join("\n"));
    await page.getByLabel(/block message/i).fill(original.message);

    const save2 = page.waitForResponse(
      (r) => r.url().includes("action=save_policies") && r.status() === 200,
    );
    await page.getByRole("button", { name: /save changes/i }).click();
    await save2;

    // Final round-trip read confirms restoration.
    const after = await page
      .waitForResponse(async () => {
        await page.reload();
        return true;
      })
      .catch(() => null);
    void after;
    const restored = await page
      .waitForResponse((r) => r.url().includes("action=get_policies") && r.status() === 200)
      .then((r) => r.json());
    expect(restored?.policies?.blocked_keywords ?? []).toEqual(original.blocked);
    expect(restored?.policies?.block_message).toBe(original.message);
  });
});
