## Endpoint audit — what I checked

I cross-referenced every entry in `supabase/functions/_shared/providers.ts` against each upstream's official documentation (OpenAI, Anthropic, Groq, xAI, Perplexity, Moonshot/Kimi, Alibaba DashScope, OpenRouter, Together, Fireworks, Mistral, DeepSeek, Azure OpenAI, Ollama, vLLM/LM Studio).

### What's correct ✅

| Provider | Base URL / paths | Auth | Notes |
|---|---|---|---|
| Lovable (managed) | `ai.gateway.lovable.dev/v1/chat/completions` | server-injected | OK |
| OpenAI | `api.openai.com/v1/chat/completions` + `/v1/models` | Bearer | OK |
| Anthropic | `api.anthropic.com/v1/messages` + `/v1/models`, `anthropic-version: 2023-06-01` | x-api-key | OK |
| OpenRouter | `openrouter.ai/api/v1/...`, optional `HTTP-Referer` + `X-Title` | Bearer | OK |
| Moonshot Kimi | `api.moonshot.ai/v1/...` | Bearer | OK (intl host; `.cn` is China-only) |
| Qwen DashScope | `dashscope-intl.aliyuncs.com/compatible-mode/v1/...` | Bearer | OK for OpenAI-compat path |
| Perplexity | `api.perplexity.ai/chat/completions` (no `/v1`) + `/v1/models` | Bearer | OK — Perplexity accepts `/chat/completions` as alias for `/v1/sonar` per OpenAI-SDK compat doc |
| Custom: Ollama | `http://localhost:11434/v1/...`, `none` auth | — | OK |
| Custom: vLLM/LM Studio/TGI | `http://localhost:8000/v1/...`, Bearer | — | OK |
| Custom: Azure OpenAI | `path_prefix: /openai/v1`, `api-key` header, `api-version` extra header | header | OK (works for both legacy + v1 GA) |
| Custom: Groq | `api.groq.com/openai/v1/...` | Bearer | OK |
| Custom: Anthropic | `api.anthropic.com/v1/...`, `anthropic_messages` | x-api-key | OK |
| Custom: OpenRouter | `openrouter.ai/api/v1/...` | Bearer | OK |
| Custom: Together | `api.together.xyz/v1/...` | Bearer | OK |
| Custom: Mistral | `api.mistral.ai/v1/...` | Bearer | OK |
| Custom: DeepSeek | `api.deepseek.com/v1/...` | Bearer | OK |
| Custom: OpenAI Responses | `api.openai.com/v1/responses`, `responses` format | Bearer | OK |

### What needs fixing ⚠️

These are real mismatches with upstream — they will cause `model_not_found` or 404s today.

**1. Built-in `lovable` provider — model suggestions stale**
- Missing the actual current Lovable Gateway models from the system prompt: `google/gemini-3.1-pro-preview`, `google/gemini-3-flash-preview`, `google/gemini-3-pro-image-preview`, `google/gemini-3.1-flash-image-preview`, `openai/gpt-5.2`.
- `google/gemini-3-flash-preview` as default is fine, but the suggestion list should match what's documented.

**2. Built-in `openai` provider — default model**
- `default_model: "gpt-4o-mini"` is still valid but stale. Recommend `gpt-5-mini` (cheap, current). Add `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-4.1-mini` to suggestions; keep `gpt-4o-mini` for back-compat.

**3. Built-in `openrouter` provider — model suggestions stale**
- `anthropic/claude-3.5-sonnet` is two generations old. Refresh: `anthropic/claude-sonnet-4-5`, `anthropic/claude-opus-4-7`, `openai/gpt-5-mini`, `meta-llama/llama-3.3-70b-instruct`, `google/gemini-2.5-flash`.

**4. Built-in `anthropic` provider — `claude-opus-4-6` is gone**
- Per Anthropic docs (Nov 2025 + later), current line is **Opus 4.7 / Sonnet 4.5 / Haiku 4.5**.
- `default_model: "claude-sonnet-4-5"` ✅ keep.
- Suggestions: replace `claude-opus-4-6` and `claude-opus-4-5` with `claude-opus-4-7` (and keep aliases like `claude-sonnet-4-5`, `claude-haiku-4-5`).

**5. Custom `anthropic` template — same fix**
- `model_suggestions: "claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5"` → `"claude-opus-4-7, claude-sonnet-4-5, claude-haiku-4-5"`.

**6. Custom `groq` template — model suggestions partly broken**
- `mixtral-8x7b-32768` was deprecated by Groq earlier this year.
- Replace with current production Groq IDs: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `gemma2-9b-it`, `deepseek-r1-distill-llama-70b`.

**7. Custom `xai` template — Grok 4 is live; suggestions stale**
- xAI now ships `grok-4`, `grok-4-fast-reasoning`, `grok-4-fast-non-reasoning`, plus `grok-4.20-*` reasoning variants. `grok-2-*` is legacy.
- `default_model: "grok-2-latest"` → `grok-4`.
- `model_suggestions: "grok-2-latest, grok-2-mini, grok-2-vision-latest"` → `"grok-4, grok-4-fast-reasoning, grok-4-fast-non-reasoning, grok-3"`.

**8. Custom `fireworks` template — wrong llama version in id**
- Registry uses `accounts/fireworks/models/llama-v3p1-70b-instruct`. Fireworks now serves Llama **3.3** as `accounts/fireworks/models/llama-v3p3-70b-instruct` (verified on Fireworks app page); `v3p1` is being deprecated.
- `default_model` and first suggestion should be `accounts/fireworks/models/llama-v3p3-70b-instruct`. Keep `v3p1-8b-instruct` only if confirmed live; safer to switch to `llama-v3p3-70b-instruct` + `qwen2p5-72b-instruct` + `deepseek-v3`.

**9. Custom `mistral` template — `ministral-8b-latest` is deprecated; add Mistral Medium 3.5**
- Per Mistral models page: current frontier is **Mistral Medium 3.5** (open-weight) plus the existing `mistral-large-latest`/`mistral-small-latest`/`codestral-latest` aliases.
- Update suggestions: `mistral-large-latest, mistral-medium-latest, mistral-small-latest, codestral-latest, open-mistral-nemo`.

**10. Built-in `perplexity` — `models_url` host quirk**
- Endpoint exists (`GET /v1/models`), but it returns Agent-API model presets, not the Sonar model list. Will still populate the dropdown with usable IDs (`sonar`, `sonar-pro`, etc.); leaving as-is is fine. No change needed — just documenting.

### Optional polish (not bugs, but nice)

- **Azure OpenAI template description**: mention that `default_model` should be the **deployment name**, not the model name. Today's description doesn't say this and it's the #1 source of "model not found" errors with Azure.
- **vLLM template `default_model: ""`**: leaving empty is correct (depends on what user serves), but the description could hint to run `curl http://localhost:8000/v1/models` to discover it.
- **Custom `anthropic` template** could include the `extra_headers: { "anthropic-version": "2023-06-01" }` explicitly so users see the convention even though the resolver auto-injects it.

## Implementation plan

Single file edit: `supabase/functions/_shared/providers.ts`.

1. Refresh `model_suggestions` and `default_model` for built-in providers: `lovable`, `openai`, `openrouter`, `anthropic`.
2. Refresh model suggestions for custom templates: `anthropic`, `groq`, `xai` (also bump `default_model`), `fireworks` (bump `default_model`), `mistral`.
3. Tighten descriptions for `azure_openai` (deployment name) and `vllm` (model discovery hint).
4. Leave all base URLs, paths, auth schemes, and `models_url` values **unchanged** — they are correct.

No DB migration, no edge-function logic changes. After saving, the dashboard's `list_providers` action will serve the updated registry to the UI immediately on the next load (no deploy needed beyond the file write — Lovable redeploys edge functions automatically).

## Verification after applying

For each provider you actually have a key for, the existing **Test API key** button on the API Keys page (with Parallel = 1) will hit the upstream end-to-end and confirm:
- Auth header is accepted (200 vs 401),
- Default model resolves (200 vs `model_not_found`),
- Latency + sample reply look sane.

For custom-endpoint templates, the **Test connection** + **Refresh from upstream** buttons in the endpoint editor will verify the `/models` URL and the `chat_path`. The "Save default model" flow will also re-validate against the live list before persisting.

Approve this plan and I'll apply the registry edits in one pass.