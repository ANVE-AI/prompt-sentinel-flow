## Goal

Add Perplexity to the provider catalog and a real **Model selector** in the Playground, so users can pick any model exposed by their chosen AnveGuard key — fetched live from the upstream provider's `/models` endpoint when possible.

## Research summary (verified against current docs)

| Provider | Chat endpoint | Auth header | Models endpoint | Notes |
|---|---|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | `Bearer` | `GET /api/v1/models` (no auth) | OpenAI-compatible |
| Perplexity | `https://api.perplexity.ai/chat/completions` | `Bearer` | `GET /v1/models` (no auth) | OpenAI-compatible. Current models: `sonar`, `sonar-pro`, `sonar-reasoning-pro`, `sonar-deep-research` |
| Anthropic | `https://api.anthropic.com/v1/messages` | `x-api-key` + `anthropic-version: 2023-06-01` | `GET /v1/models` (auth required) | Not OpenAI-shaped — already has adapter. Current: `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5` |
| Kimi (Moonshot) | `https://api.moonshot.ai/v1/chat/completions` (international; `.cn` is mainland) | `Bearer` | `GET /v1/models` | OpenAI-compatible |
| Qwen (DashScope) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions` | `Bearer` | `GET /compatible-mode/v1/models` | OpenAI-compatible |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `Bearer` | `GET /v1/models` | Native |
| Lovable AI (managed) | `https://ai.gateway.lovable.dev/v1/chat/completions` | `Bearer LOVABLE_API_KEY` | — (use static suggestions) | OpenAI-compatible |

## Changes

### 1. `supabase/functions/_shared/providers.ts`

- **Add Perplexity** entry (`id: "perplexity"`, OpenAI-compatible, sonar models).
- **Refresh Anthropic suggestions** to current Claude 4.x family (`claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-5`).
- Add a `models_url?: string` field on each provider pointing to its `/models` endpoint (omit for `lovable` since it has none).

### 2. `supabase/functions/dashboard/index.ts` — new action `list_models`

- Input: `{ api_key_id }` (the user's AnveGuard key id).
- Look up the key, get provider + decrypt provider key.
- Fetch the provider's `models_url` with the right auth (`Bearer` for most, `x-api-key`+`anthropic-version` for Anthropic, no auth for OpenRouter/Perplexity but sending the key doesn't hurt).
- Return `{ models: string[] }` (parse `data[].id` from OpenAI-format responses, `data[].id` from Anthropic too).
- For `lovable` (no `/models` endpoint): return the static `model_suggestions` from the catalog.
- Cache in-memory per provider+key for ~5 min to avoid hammering upstreams.

### 3. `src/pages/dashboard/Playground.tsx`

- Add `keyId` (already exists for "reference") become the **primary** input — required, drives:
  - Auto-fill of the AnveGuard key field is impossible (we don't store plaintext), but we can store the key in `sessionStorage` keyed by `keyId` once the user pastes it the first time.
  - Loading the model list via `list_models({ api_key_id: keyId })`.
- New `<Select>` for **Model**, defaulting to the key's `model_default`. When a user picks one, send `model: <picked>` in the proxy request body.
- Show a loading skeleton while models fetch; fall back to free-text input if `list_models` fails (e.g. invalid upstream key).

### 4. `src/pages/dashboard/Keys.tsx`

- The "Default model" `<Input>` becomes a combobox/select once `list_models` succeeds: pick from real upstream models, with free-text fallback. Keep current free-text behavior if the call fails.
- This requires the key to already exist before fetching models — so on the **create** dialog we keep the current static `model_suggestions`. On the **list** view, add an inline "Change default model" affordance per key that fetches live models.

## Files touched

- `supabase/functions/_shared/providers.ts` (add Perplexity, refresh Anthropic, add `models_url`)
- `supabase/functions/dashboard/index.ts` (new `list_models` action)
- `src/pages/dashboard/Playground.tsx` (Key dropdown drives Model dropdown; per-request model override)
- `src/pages/dashboard/Keys.tsx` (live model list for default-model edit, optional polish)

## Out of scope

- Per-key allowed-model whitelist policy (good follow-up — would slot into `policies` table).
- Pricing / context-length display (could come from the same `/models` payload later).
