// Matrix tests: every combination of (workspace allow_client_system_prompt) ×
// (api_key.is_admin) must produce the exact same outcome the proxy emits at
// runtime. The decision is owned by `decideSystemPromptGate` in _shared so
// these tests cover the proxy behavior without needing to boot the function.
//
// Matrix:
//   workspace=false, key_admin=false → 403 system_prompt_disabled_workspace
//   workspace=false, key_admin=true  → 403 system_prompt_disabled_workspace
//   workspace=true,  key_admin=false → 403 system_prompt_forbidden
//   workspace=true,  key_admin=true  → 200 system_prompt_accepted
//
// We also verify:
//   • absent / empty `system_prompt` bypasses the gates entirely (no-op)
//   • workspace gate beats key_admin gate when both fail (more actionable)
//   • validation errors short-circuit BEFORE any gate runs (so a bad payload
//     from an admin key in an allowing workspace still 400s, never 200s)

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideSystemPromptGate,
  validateSystemPrompt,
} from "../_shared/system_prompt.ts";

type Combo = { workspaceAllows: boolean; keyIsAdmin: boolean };

const ALL_COMBOS: Combo[] = [
  { workspaceAllows: false, keyIsAdmin: false },
  { workspaceAllows: false, keyIsAdmin: true },
  { workspaceAllows: true, keyIsAdmin: false },
  { workspaceAllows: true, keyIsAdmin: true },
];

Deno.test("matrix: workspace=false × key_admin=false → disabled_workspace 403", () => {
  const d = decideSystemPromptGate({ workspaceAllows: false, keyIsAdmin: false });
  assertEquals(d.allowed, false);
  assertEquals(d.status, 403);
  assertEquals(d.code, "system_prompt_disabled_workspace");
  assertEquals(d.gate, "workspace");
});

Deno.test("matrix: workspace=false × key_admin=true → disabled_workspace 403 (workspace gate wins)", () => {
  // Even an admin key cannot bypass a workspace-level disablement. This is
  // intentional: workspace settings are the more authoritative control.
  const d = decideSystemPromptGate({ workspaceAllows: false, keyIsAdmin: true });
  assertEquals(d.allowed, false);
  assertEquals(d.status, 403);
  assertEquals(d.code, "system_prompt_disabled_workspace");
  assertEquals(d.gate, "workspace");
});

Deno.test("matrix: workspace=true × key_admin=false → forbidden 403", () => {
  const d = decideSystemPromptGate({ workspaceAllows: true, keyIsAdmin: false });
  assertEquals(d.allowed, false);
  assertEquals(d.status, 403);
  assertEquals(d.code, "system_prompt_forbidden");
  assertEquals(d.gate, "key_admin");
});

Deno.test("matrix: workspace=true × key_admin=true → accepted", () => {
  const d = decideSystemPromptGate({ workspaceAllows: true, keyIsAdmin: true });
  assertEquals(d.allowed, true);
  assertEquals(d.status, 200);
  assertEquals(d.code, "system_prompt_accepted");
  assertEquals(d.gate, null);
});

Deno.test("matrix: every combo returns a stable, distinct (status, code) pair", () => {
  // Catches accidental drift where two combos collapse to the same outcome.
  const seen = new Set<string>();
  for (const c of ALL_COMBOS) {
    const d = decideSystemPromptGate(c);
    seen.add(`${d.status}:${d.code}:${d.gate}`);
  }
  // 4 inputs → 3 distinct outcomes (the two workspace=false rows collapse
  // into the same workspace-gate response, by design).
  assertEquals(seen.size, 3);
});

Deno.test("matrix: only the (true, true) cell is allowed", () => {
  const allowedCount = ALL_COMBOS.filter((c) => decideSystemPromptGate(c).allowed).length;
  assertEquals(allowedCount, 1);
});

Deno.test("matrix: rejected outcomes always carry a gate label for the audit log", () => {
  for (const c of ALL_COMBOS) {
    const d = decideSystemPromptGate(c);
    if (!d.allowed) {
      assert(d.gate === "workspace" || d.gate === "key_admin",
        `expected gate label for combo ${JSON.stringify(c)}`);
    }
  }
});

Deno.test("matrix: validation rejection short-circuits before the gate (admin + workspace allows)", () => {
  // The proxy runs validation FIRST. So even in the "best case" combo, a
  // bad payload must fail with a 400 validation error — never reach a 200.
  const v = validateSystemPrompt("a".repeat(50), 10);
  assert(v.error, "expected validation to fail");
  assertEquals(v.code, "system_prompt_too_long");
  // Sanity: the gate alone would have allowed this combo.
  assertEquals(decideSystemPromptGate({ workspaceAllows: true, keyIsAdmin: true }).allowed, true);
});

Deno.test("matrix: absent system_prompt bypasses the gates regardless of combo", () => {
  // The proxy only calls `decideSystemPromptGate` when the validated value
  // is non-empty. Absent / null / undefined inputs return value="" from the
  // validator, which the proxy treats as "no override requested" — gates
  // never run, and an OpenAI-compatible request from a non-admin key in a
  // disallowing workspace still succeeds.
  for (const raw of [undefined, null]) {
    const v = validateSystemPrompt(raw);
    assertEquals(v.error, null);
    assertEquals(v.value, "");
    // Proxy guard: `if (customSystemPrompt) { ...gate... }` — empty skips.
  }
});

Deno.test("matrix: empty/whitespace system_prompt is rejected at validation, never reaches gates", () => {
  // A common mistake is sending `system_prompt: ""` to mean "no override".
  // We reject this loudly so callers don't develop the habit of relying on
  // silent fallthrough — the gate matrix is never consulted in this case.
  for (const bad of ["", "   ", "\n\t\r"]) {
    const v = validateSystemPrompt(bad);
    assert(v.error, `expected validation error for ${JSON.stringify(bad)}`);
    assertEquals(v.code, "system_prompt_empty");
  }
});

Deno.test("matrix: full end-to-end outcome per combo (validation → gate)", () => {
  // Models the proxy's actual decision sequence: validate first, then gate.
  // Returns the public-facing (status, code) the caller would see for a
  // valid, non-empty prompt.
  function decide(c: Combo, prompt: unknown, max = 16_000) {
    const v = validateSystemPrompt(prompt, max);
    if (v.error) return { status: 400, code: v.code };
    if (!v.value) return { status: 200, code: null }; // no override
    const g = decideSystemPromptGate(c);
    return { status: g.status, code: g.code };
  }

  const VALID = "You are a helpful assistant.";
  const cases: Array<[Combo, unknown, number, string | null]> = [
    [{ workspaceAllows: false, keyIsAdmin: false }, VALID, 403, "system_prompt_disabled_workspace"],
    [{ workspaceAllows: false, keyIsAdmin: true }, VALID, 403, "system_prompt_disabled_workspace"],
    [{ workspaceAllows: true, keyIsAdmin: false }, VALID, 403, "system_prompt_forbidden"],
    [{ workspaceAllows: true, keyIsAdmin: true }, VALID, 200, "system_prompt_accepted"],
    // Validation beats the gate even in the "best case" combo.
    [{ workspaceAllows: true, keyIsAdmin: true }, 123, 400, "system_prompt_invalid_type"],
    // Absent prompt is a no-op in every combo.
    [{ workspaceAllows: false, keyIsAdmin: false }, undefined, 200, null],
    [{ workspaceAllows: true, keyIsAdmin: true }, undefined, 200, null],
  ];

  for (const [combo, prompt, expectedStatus, expectedCode] of cases) {
    const r = decide(combo, prompt);
    assertEquals(r.status, expectedStatus,
      `wrong status for combo=${JSON.stringify(combo)} prompt=${JSON.stringify(prompt)}`);
    assertEquals(r.code, expectedCode,
      `wrong code for combo=${JSON.stringify(combo)} prompt=${JSON.stringify(prompt)}`);
  }
});
