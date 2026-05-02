// Integration test: revoked API key handling.
//
// Verifies two security guarantees of the proxy's auth gate:
//   1. A request bearing a revoked API key (is_active = false) is rejected
//      with HTTP 401 and the standard "Invalid or revoked API key" error
//      shape — identical to the response for a totally unknown key, so we
//      don't leak whether the key ever existed.
//   2. The rejection happens BEFORE any upstream provider call AND before
//      any `request_logs` row is written. We assert this by snapshotting
//      the row count tied to the test key both before and after the call
//      and confirming it stays at zero.
//
// Setup uses the service role to insert a fake `api_keys` row with a known
// SHA-256 hash for a known plaintext token, then deletes it on teardown.
// We deliberately do NOT touch `auth.users` or any other reserved schema.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assertEquals,
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) throw new Error("SUPABASE_URL / VITE_SUPABASE_URL must be set");
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set");

const PROXY_URL = `${SUPABASE_URL}/functions/v1/proxy`;

// Test fixture identity. Using a stable, recognizably-fake user id makes
// stray rows easy to find and clean up later if a teardown ever fails.
const TEST_USER_ID = "test-revoked-key-user";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function admin() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function seedRevokedKey() {
  // Build a unique plaintext token for this test run. The proxy only
  // accepts tokens whose Authorization header matches /^Bearer ag_live_\S+/i,
  // so we keep that prefix.
  const plain = `ag_live_test_revoked_${crypto.randomUUID().replace(/-/g, "")}`;
  const key_hash = await sha256Hex(plain);
  const sb = admin();

  // `api_keys.user_id` has a FK to `profiles.clerk_user_id`. Make sure the
  // fixture profile exists before inserting the key. Upsert is idempotent
  // across reruns.
  const { error: profErr } = await sb
    .from("profiles")
    .upsert(
      { clerk_user_id: TEST_USER_ID, email: "test-revoked-key@anveguard.test" },
      { onConflict: "clerk_user_id" },
    );
  if (profErr) {
    throw new Error(`Failed to seed test profile: ${profErr.message}`);
  }

  const { data, error } = await sb
    .from("api_keys")
    .insert({
      user_id: TEST_USER_ID,
      name: "integration-test-revoked",
      key_prefix: plain.slice(0, 16),
      key_hash,
      // Provider value is irrelevant — auth gate triggers before provider
      // resolution. Pick any non-custom string.
      provider: "openai",
      is_active: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to seed revoked key: ${error?.message ?? "no row"}`);
  }
  return { plain, key_hash, id: data.id as string };
}

async function teardownKey(id: string) {
  const sb = admin();
  // Logs first (just in case something slipped through), then the key row.
  // We intentionally leave the test profile in place — it's a stable fixture
  // and removing it would cascade-delete any other test data on parallel runs.
  await sb.from("request_logs").delete().eq("api_key_id", id);
  await sb.from("api_keys").delete().eq("id", id);
}
async function countLogsForKey(id: string): Promise<number> {
  const sb = admin();
  const { count, error } = await sb
    .from("request_logs")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", id);
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

async function postChat(token: string) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    }),
  });
  // Always consume the body — Deno will leak the connection otherwise.
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  return { status: res.status, body: parsed, raw: text };
}

Deno.test("proxy rejects revoked API key with 401 before calling provider", async () => {
  const seeded = await seedRevokedKey();
  try {
    const before = await countLogsForKey(seeded.id);
    assertEquals(before, 0, "fixture should start with zero logs");

    const { status, body } = await postChat(seeded.plain);

    // 1. Auth gate returns the standard 401 + OpenAI-shaped error.
    assertEquals(status, 401, "revoked key must return HTTP 401");
    assert(body?.error, "response must use OpenAI-style error envelope");
    assertEquals(body.error.type, "authentication_error");
    assertEquals(body.error.code, "invalid_api_key");
    assertStringIncludes(
      String(body.error.message),
      "Invalid or revoked API key",
      "error message must match the documented copy",
    );

    // 2. Proxy short-circuited before any upstream/log activity. Allow a
    // brief settle window in case logging were ever moved to a background
    // task — the assertion still holds because no log row should appear.
    await new Promise((r) => setTimeout(r, 250));
    const after = await countLogsForKey(seeded.id);
    assertEquals(
      after,
      0,
      "no request_logs row may be written for a revoked key — that would imply the proxy reached the provider call path",
    );
  } finally {
    await teardownKey(seeded.id);
  }
});

Deno.test("proxy returns the same 401 for an unknown API key (no info leak)", async () => {
  // A well-formed but never-seeded token. Same shape as a real key so the
  // Authorization regex passes and we exercise the DB lookup branch.
  const bogus = `ag_live_unknown_${crypto.randomUUID().replace(/-/g, "")}`;
  const { status, body } = await postChat(bogus);

  assertEquals(status, 401);
  assertEquals(body?.error?.type, "invalid_request_error");
  assertStringIncludes(String(body?.error?.message), "Invalid or revoked API key");
});

Deno.test("proxy rejects requests with no Authorization header", async () => {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  assertEquals(res.status, 401);
  assertStringIncludes(String(body?.error?.message), "Missing or invalid AnveGuard API key");
});

// ---------------------------------------------------------------------------
// Repeated revoked-key requests: documented behavior
// ---------------------------------------------------------------------------
// The proxy intentionally does NOT rate-limit by API key at the auth gate.
// Every request bearing a revoked key must return the same 401 in O(1) — we
// rely on this so a leaked-then-revoked key never accidentally consumes
// upstream quota, but also so legitimate clients holding a stale key get a
// fast, deterministic failure instead of being silently throttled into a
// retry storm with no diagnostic.
//
// This test pins that contract:
//   1. A burst of N concurrent requests with the same revoked key all return
//      HTTP 401 (no 429, no 5xx, no upstream pass-through).
//   2. Each individual response uses the documented error shape — no variant
//      messaging that would suggest tiered/throttled handling.
//   3. Zero `request_logs` rows are written for any of the N attempts. If the
//      proxy ever started logging revoked-key calls (e.g. for abuse tracking)
//      this test would flip and we'd revisit the contract deliberately.
//   4. The whole burst completes well under a generous wall-clock budget,
//      proving the rejection path doesn't degrade under repeated hits.
Deno.test("proxy does not rate-limit revoked keys: burst still returns 401 for every call", async () => {
  const seeded = await seedRevokedKey();
  try {
    const before = await countLogsForKey(seeded.id);
    assertEquals(before, 0, "fixture should start with zero logs");

    // 25 is enough to make any naive per-key counter trip a 429 if one
    // existed, but small enough to keep the test fast in CI.
    const BURST = 25;
    const t0 = Date.now();
    const results = await Promise.all(
      Array.from({ length: BURST }, () => postChat(seeded.plain)),
    );
    const wallMs = Date.now() - t0;

    // 1 + 2: every single response must be the same 401 + same error shape.
    // We collect the distinct (status, message) tuples so a single failure
    // surfaces the actual divergence in the assertion message.
    const shapes = new Set(
      results.map((r) =>
        `${r.status}::${r.body?.error?.type ?? ""}::${r.body?.error?.message ?? ""}`
      ),
    );
    assertEquals(
      shapes.size,
      1,
      `all ${BURST} burst responses must share one shape; got ${shapes.size}: ${
        [...shapes].join(" | ")
      }`,
    );
    for (const r of results) {
      assertEquals(r.status, 401, "every burst response must be 401, not 429/5xx");
      assertEquals(r.body?.error?.type, "invalid_request_error");
      assertStringIncludes(
        String(r.body?.error?.message),
        "Invalid or revoked API key",
      );
    }

    // 3: no logs ever written, even under burst.
    await new Promise((r) => setTimeout(r, 250));
    const after = await countLogsForKey(seeded.id);
    assertEquals(
      after,
      0,
      `no request_logs row may be written for a revoked key under burst (got ${after})`,
    );

    // 4: O(1) rejection — generous ceiling so cold-start variance in CI
    // doesn't flake the test, but tight enough to catch real regression
    // (e.g. accidental upstream call per request).
    assert(
      wallMs < 15_000,
      `burst of ${BURST} revoked-key requests should reject quickly, took ${wallMs}ms`,
    );
  } finally {
    await teardownKey(seeded.id);
  }
});

