import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getProvider, resolveEndpoint } from "./providers.ts";

Deno.test("perplexity: model_id_filter keeps only perplexity-served ids", () => {
  const def = getProvider("perplexity")!;
  const filter = def.model_id_filter!;

  // Kept
  assertEquals(filter({ id: "perplexity/sonar", owned_by: "perplexity" }), true);
  assertEquals(filter({ id: "sonar", owned_by: "perplexity" }), true);
  assertEquals(filter({ id: "sonar-pro", owned_by: null }), true);
  assertEquals(filter({ id: "sonar-reasoning-pro", owned_by: null }), true);

  // Dropped — Perplexity advertises these in /v1/models but doesn't actually serve them
  assertEquals(filter({ id: "openai/gpt-5", owned_by: "openai" }), false);
  assertEquals(filter({ id: "openai/gpt-5.4-mini", owned_by: "openai" }), false);
  assertEquals(filter({ id: "anthropic/claude-sonnet-4-5", owned_by: "anthropic" }), false);
  assertEquals(filter({ id: "nvidia/nemotron-3-super-120b-a12b", owned_by: "nvidia" }), false);
  assertEquals(filter({ id: "xai/grok-4-1-fast-non-reasoning", owned_by: "xai" }), false);
  assertEquals(filter({ id: "google/gemini-3-flash-preview", owned_by: "google" }), false);
});

Deno.test("perplexity: model_id_normalize strips the perplexity/ prefix", () => {
  const def = getProvider("perplexity")!;
  const norm = def.model_id_normalize!;

  assertEquals(norm("perplexity/sonar"), "sonar");
  assertEquals(norm("perplexity/sonar-pro"), "sonar-pro");
  // Idempotent for already-bare names
  assertEquals(norm("sonar"), "sonar");
  assertEquals(norm("sonar-deep-research"), "sonar-deep-research");
});

Deno.test("resolveEndpoint exposes normalize_model for perplexity", () => {
  const r = resolveEndpoint({ provider: "perplexity" }, "pplx-fake");
  assertEquals(typeof r.normalize_model, "function");
  assertEquals(r.normalize_model!("perplexity/sonar"), "sonar");
});

Deno.test("resolveEndpoint does not set normalize_model for openai", () => {
  const r = resolveEndpoint({ provider: "openai" }, "sk-fake");
  assertEquals(r.normalize_model, undefined);
});
