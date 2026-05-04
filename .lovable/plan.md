## Problem

When the user picks a **Perplexity (Sonar)** endpoint in the Playground, the model dropdown lists every model Perplexity advertises in `/v1/models` — including `openai/gpt-5*`, `anthropic/claude-*`, `nvidia/nemotron-*`, `xai/grok-*`. None of those work via Perplexity's chat API, so picking them returns an `Invalid model` error.

Even the only "valid" entry, `perplexity/sonar`, fails because Perplexity's chat API expects the bare name `sonar` (not the namespaced `perplexity/sonar` returned by their models list).

Root cause is in `supabase/functions/dashboard/index.ts → list_models`: it forwards the upstream models response verbatim through `parseModelsResponse` without provider-specific filtering.

## Fix

### 1. Add per-provider model filtering in `_shared/providers.ts`

Extend `ProviderDef` with two optional fields:
- `model_id_filter?: (id: string) => boolean` — predicate to keep only models the provider's chat endpoint actually accepts
- `model_id_normalize?: (id: string) => string` — rewrite the id to what the chat endpoint expects

For the built-in **Perplexity** provider:
- `model_id_filter`: keep ids where `owned_by === "perplexity"` OR `id` starts with `perplexity/` OR `id` matches `^sonar` (covers any future bare-name response)
- `model_id_normalize`: strip a leading `perplexity/` prefix so `perplexity/sonar` becomes `sonar` before being sent to `/chat/completions`

(Other providers can opt in later — this PR only wires Perplexity since that's the broken one. OpenRouter intentionally returns a multi-vendor list, which is correct for OpenRouter.)

### 2. Apply filter + normalize in `dashboard/index.ts → list_models`

After `parseModelsResponse(j, hint)`:
- If the provider has a `model_id_filter`, run `parsed.models.filter(m => filter(m))` first
- Map through `model_id_normalize` if present
- Dedupe and use the normalized ids as the dropdown options
- If the filter empties the list, fall back to `model_suggestions` (defensive)

### 3. Apply normalization on the proxy path in `_shared/providers.ts → resolveEndpoint`

Return an optional `normalize_model?: (id: string) => string` from `resolveEndpoint` so the proxy can apply it to the incoming `model` field before forwarding. This guarantees correctness even for clients that hardcode `perplexity/sonar` or paste a value from the old dropdown.

### 4. Wire normalization into the proxy

In `supabase/functions/proxy/index.ts`, find the spot where the upstream request body is built (where `model` is read from the incoming request) and apply `normalize_model(model)` if defined. No behavior change for any provider that doesn't define one.

### 5. Tests

Add a small Deno test at `supabase/functions/_shared/providers_test.ts` (or extend an existing one) covering:
- `perplexity` filter: keeps `perplexity/sonar`, drops `openai/gpt-5`, `nvidia/...`, `anthropic/...`
- `perplexity` normalize: `perplexity/sonar` → `sonar`, `sonar-pro` → `sonar-pro` (idempotent)

## Out of scope

- No DB changes
- No UI changes (the existing Playground `<Select>` keeps working; it just receives a clean list)
- Other providers (OpenAI, Anthropic, OpenRouter, Kimi, Qwen) keep current behavior — their `/v1/models` already returns ids that work directly

## Files touched

- `supabase/functions/_shared/providers.ts` (filter + normalize hooks, Perplexity wiring, `resolveEndpoint` returns normalize_model)
- `supabase/functions/dashboard/index.ts` (apply filter+normalize in `list_models`)
- `supabase/functions/proxy/index.ts` (apply `normalize_model` before forwarding)
- `supabase/functions/_shared/providers_test.ts` (new)

After approval I'll implement, redeploy `dashboard` and `proxy`, and verify by listing models for the Perplexity key and sending `sonar` through the proxy.
