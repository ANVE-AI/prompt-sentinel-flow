# Custom endpoints in AnveGuard

Today AnveGuard supports a fixed registry of providers (Lovable, OpenAI, OpenRouter, Anthropic, Perplexity, Kimi, Qwen). Many users run their own gateways (Ollama, vLLM, LM Studio), use Azure OpenAI, or want a provider we haven't shipped yet (Groq, Together, Fireworks, DeepInfra, Cerebras…). We'll add a first‑class **Custom endpoint** provider so any OpenAI‑ or Anthropic‑compatible API can be used behind an AnveGuard key, with full policy enforcement, logging, model listing, and streaming.

## Research summary (what custom endpoints actually need)

From the docs of the most common targets:

- **Ollama** — `http://host:11434/v1/chat/completions`, OpenAI‑compatible, models at `GET /v1/models`, auth ignored.
- **vLLM / LM Studio / TGI / llama.cpp server** — `http://host:8000/v1/chat/completions`, `Authorization: Bearer <token>` (often `EMPTY`), models at `/v1/models`.
- **Groq / Together / Fireworks / DeepInfra / Cerebras / xAI / Mistral** — OpenAI‑compatible `/v1/chat/completions` + `/v1/models`, `Authorization: Bearer …`.
- **Azure OpenAI** — non‑standard URL `https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=YYYY‑MM‑DD`, auth via `api-key: <key>` header (not Bearer). Newer "OpenAI v1" surface: `https://<resource>.openai.azure.com/openai/v1/chat/completions` with `api-key` header — much simpler.
- **Self‑hosted Anthropic‑compatible** (e.g. Claude on Bedrock proxies) — `/v1/messages`, `x-api-key`, `anthropic-version`.

So a custom endpoint needs to capture: **kind** (openai‑compatible vs anthropic), **base URL** (we append the chat path if missing), optional **models URL**, **auth scheme** (`bearer` / `api-key header` / `x-api-key` / `none`), **custom auth header name**, optional **extra headers** (e.g. `api-version`, `HTTP-Referer`), and an optional **default model**.

## Plan

### 1. Schema (migration)

Add nullable columns to `api_keys` to hold per‑key custom config (only used when `provider = 'custom'`):

```text
custom_base_url            text         -- e.g. https://my-host/v1
custom_models_url          text         -- optional; defaults to base_url + /models
custom_kind                text         -- 'openai_compatible' | 'anthropic'
custom_auth_scheme         text         -- 'bearer' | 'header' | 'x-api-key' | 'none'
custom_auth_header         text         -- header name when scheme='header' (default 'Authorization')
custom_extra_headers       jsonb        -- { "api-version": "2024-10-21", ... }
```

No data backfill needed; existing rows stay on the built‑in providers.

### 2. Provider registry (`supabase/functions/_shared/providers.ts`)

Add a sentinel provider:

```ts
{
  id: "custom",
  label: "Custom endpoint",
  kind: "openai_compatible",        // overridden per-key by custom_kind
  url: "",                          // resolved per-key from custom_base_url
  default_model: "",
  model_suggestions: [],
  key_placeholder: "your provider key (or leave blank)",
  get_key_url: "https://docs.anveguard.app/custom-endpoints",
}
```

Add a helper `resolveEndpoint(keyRow)` that, for `provider === 'custom'`, returns `{ url, models_url, kind, headers }` built from the row's custom_* fields. URL normalization: if `custom_base_url` ends with `/v1` we append `/chat/completions` (or `/messages` for anthropic); if it already ends in `/chat/completions` we use it verbatim. Same for models URL.

### 3. Dashboard backend (`supabase/functions/dashboard/index.ts`)

- **`list_providers`** — include the new `custom` entry plus a `custom_schema` block describing the form fields (kinds, auth schemes) so the UI is data‑driven.
- **`create_key`** — when `provider === 'custom'`, validate `custom_base_url` (https only, except localhost/127.0.0.1/.local for self‑hosted), validate `custom_kind` and `custom_auth_scheme`, persist all `custom_*` columns. The provider key is still encrypted in `provider_key_encrypted` (may be empty for `none`).
- **`list_models`** — for `custom`, use the resolved models URL with the resolved auth headers; same 5‑minute cache, same fallback to the user's own `model_suggestions` (we'll let them paste a comma‑separated list at create time, stored as part of `custom_extra_headers.__suggestions` or a tiny `custom_model_suggestions text[]` column — see Technical details).
- **`list_keys`** — also return the `custom_base_url` and `custom_kind` so the UI can show "Custom · ollama.local" badges.
- **Test endpoint (new action `test_custom_endpoint`)** — given the form values (without saving), make one tiny `GET /models` request and report `ok / status / sample-model`. Lets users validate before saving.

### 4. Proxy (`supabase/functions/proxy/index.ts`)

Replace the hard‑coded `provider.url`, `provider.kind`, and header logic with `resolveEndpoint(keyRow)`. The streaming + policy + logging code stays unchanged because it already branches on `kind`. Azure's `api-version` query param is handled by storing the full URL (with `?api-version=…`) in `custom_base_url`; the proxy preserves the query string when appending the chat path.

### 5. UI — Keys page (`src/pages/dashboard/Keys.tsx`)

When the user picks **Custom endpoint** in the provider dropdown, reveal an extra panel:

- Name, Default model (free text)
- **Kind** select: OpenAI‑compatible / Anthropic‑compatible
- **Base URL** input (`https://my-host/v1` or full chat URL; helper text shows what we'll call)
- **Models URL** input (optional, auto‑filled)
- **Auth scheme** select: Bearer token / Custom header / `x-api-key` / None
- **Header name** input (visible only when scheme = Custom header)
- **Provider API key** input (hidden when scheme = None)
- **Extra headers** key/value rows (for Azure `api-version`, OpenRouter‑style `HTTP-Referer`, etc.)
- **Model suggestions** textarea (comma‑separated; used as fallback if `/models` fails or returns nothing)
- A **"Test connection"** button calling `test_custom_endpoint` that shows ✓ / error inline.

A small "Templates" dropdown at the top of the panel pre‑fills the form for: **Ollama (local)**, **vLLM / LM Studio**, **Azure OpenAI**, **Groq**, **Together**, **Fireworks**, **xAI Grok**, **Mistral**, **DeepSeek**, **Anthropic‑compatible**.

### 6. UI — Playground (`src/pages/dashboard/Playground.tsx`)

No changes needed beyond what already exists — model selector reads from `list_models`, which now works for `custom` too.

### 7. Live verification (do this after building, in default mode)

1. Deploy `dashboard` and `proxy` edge functions.
2. Create a custom key against `https://api.groq.com/openai/v1` with the user's Groq token (or an Ollama URL if available), confirm `list_models` returns live IDs, run a streaming completion in the Playground, and confirm a row appears in `request_logs`.
3. Create a key against an Azure OpenAI deployment URL with `api-key` auth and confirm chat works.
4. Re‑run the Lovable / OpenAI / Anthropic flows to confirm we didn't regress them.

## Technical details

- **Why a column instead of a JSON blob:** queries (`list_keys`) and indexes stay simple, and `provider_key_encrypted` already exists for the upstream secret. We will use one extra `jsonb` column (`custom_extra_headers`) for arbitrary headers, and a `text[]` column (`custom_model_suggestions`) for fallback model IDs — both nullable.
- **URL normalization rules** (in `resolveEndpoint`): strip trailing `/`; if path doesn't end in `/chat/completions` (openai) or `/messages` (anthropic), append it; preserve the original querystring (Azure). Models URL: if user left blank, derive `<origin><pathPrefix>/models`.
- **Security:** disallow `http://` except for `localhost`, `127.0.0.1`, `0.0.0.0`, `*.local`, and RFC1918 ranges (so users can hit Ollama on their LAN but we don't accidentally exfiltrate to plaintext public endpoints). Reject URLs to AWS/GCP metadata IPs (`169.254.169.254`, `metadata.google.internal`) to prevent SSRF from edge functions.
- **Header allow‑list:** custom_extra_headers may not override `Authorization`, `x-api-key`, `Content-Type`, or `Host` — those are computed by the proxy.
- **Anthropic kind:** when the user picks anthropic kind, the proxy reuses the existing `openaiToAnthropicRequest` / `anthropicStreamToOpenAI` adapters unchanged.
- **Caching:** `list_models` cache key becomes `${provider}:${custom_base_url ?? ''}:${provider_key_encrypted ?? ''}` so distinct custom endpoints don't collide.
- **Migration:** simple `ALTER TABLE public.api_keys ADD COLUMN …` for the six new columns, all nullable, no defaults required.

## Files to change

- migration: add `custom_*` columns to `api_keys`
- `supabase/functions/_shared/providers.ts` — add `custom` provider + `resolveEndpoint` helper + URL normalizer
- `supabase/functions/dashboard/index.ts` — new fields in `create_key`, `list_keys`, `list_models`; new `test_custom_endpoint` action
- `supabase/functions/proxy/index.ts` — use `resolveEndpoint` instead of hard‑coded provider config
- `src/pages/dashboard/Keys.tsx` — custom endpoint form + templates + Test connection button
