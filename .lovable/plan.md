## Goal

Make AnveGuard work the way you described:

1. User pastes upstream provider API keys (OpenRouter, Anthropic Claude, OpenAI, Moonshot/Kimi, DashScope/Qwen, plus the built-in Lovable AI).
2. User configures policies (blocked / allowed keywords, global defaults, custom block message).
3. User generates an AnveGuard key (`ag_live_…`) bound to one upstream provider+credential.
4. Their app calls AnveGuard's `/proxy` endpoint with that key — AnveGuard enforces policies, forwards to the right upstream, and logs every request for tracking.

The skeleton already exists (Lovable + OpenAI). This plan extends it cleanly to the rest.

## What changes

### 1. Provider catalog (single source of truth)

New file `supabase/functions/_shared/providers.ts` describing each supported upstream:

```text
lovable     → https://ai.gateway.lovable.dev/v1/chat/completions   (OpenAI-compatible, uses LOVABLE_API_KEY, no user key)
openai      → https://api.openai.com/v1/chat/completions           (OpenAI-compatible, user key)
openrouter  → https://openrouter.ai/api/v1/chat/completions        (OpenAI-compatible, user key)
kimi        → https://api.moonshot.ai/v1/chat/completions          (OpenAI-compatible, user key)
qwen        → https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions (OpenAI-compatible, user key)
anthropic   → https://api.anthropic.com/v1/messages                (NOT OpenAI-compatible — needs adapter)
```

Each entry stores: id, label, base URL, auth header style, default model suggestions, and a `kind` of `openai_compatible` or `anthropic`.

### 2. Database

Schema-compatible — `api_keys.provider` is already `text`, so no migration needed for the new IDs. We will add one optional column for clarity:

- `api_keys.provider_label` (text, nullable) — display name shown in dashboard if user gave one.

(Optional, can be skipped — not strictly required.)

### 3. Edge function: `proxy`

Refactor `supabase/functions/proxy/index.ts`:

- Replace the hard-coded `lovable | openai` branching with a lookup in the provider catalog.
- For `openai_compatible` providers: forward the OpenAI-shaped body straight through with `Authorization: Bearer <decrypted user key>`.
- For `anthropic`: translate request/response between OpenAI Chat Completions shape and Anthropic Messages shape, including streaming SSE deltas, so user apps keep using one consistent client.
- Keep policy enforcement (input + output keyword scan, block message, logging) exactly as today — it runs before/after the upstream call regardless of provider.
- Keep usage tracking (`tokens_in`, `tokens_out`, `latency_ms`, `status`, `block_reason`) in `request_logs`.

### 4. Edge function: `dashboard`

Update `create_key` in `supabase/functions/dashboard/index.ts`:

- Accept any `provider` from the catalog (not just `lovable | openai`).
- Require `provider_key` for every provider except `lovable`.
- Encrypt with existing `encryptString` and store in `provider_key_encrypted`.

Add a tiny new action `list_providers` returning the catalog so the frontend stays in sync.

### 5. Frontend: Keys page

`src/pages/dashboard/Keys.tsx`:

- Replace the 2-item Select with the full provider list fetched from `list_providers`.
- Conditionally show the "Provider API key" input for any provider other than `lovable`, with provider-specific placeholder (`sk-…`, `sk-or-…`, `sk-ant-…`, etc.) and a "where to get it" helper link.
- Suggest a sensible default model per provider (e.g. `anthropic/claude-3-5-sonnet-latest`, `openrouter/auto`, `moonshot-v1-8b`, `qwen-plus`).
- Code-snippet card stays the same — the AnveGuard key + proxy URL is the only thing the end app needs.

### 6. Policies, Logs, Playground, Overview

No structural changes — they already work off `user_id` and `api_key_id`, so they automatically cover new providers. Logs page will start showing the new provider names in its existing column.

## Technical notes

- Anthropic adapter lives entirely inside `proxy/index.ts` (or a small `_shared/anthropic.ts`) — no new dependencies. Streaming uses Anthropic's `event: content_block_delta` SSE frames mapped to OpenAI `choices[0].delta.content`.
- The provider catalog is defined once and imported by both edge functions and the frontend (frontend gets it via `list_providers` to avoid duplicating the list in TS).
- Encryption for stored upstream keys already uses `KEY_ENCRYPTION_SECRET` via `encryptString` / `decryptString` — reused unchanged.
- Policy engine, request logging, key hashing, and Clerk auth are untouched.

## Files touched

- `supabase/functions/_shared/providers.ts` (new)
- `supabase/functions/_shared/anthropic.ts` (new, small adapter)
- `supabase/functions/proxy/index.ts` (refactor branching)
- `supabase/functions/dashboard/index.ts` (open up `create_key`, add `list_providers`)
- `src/pages/dashboard/Keys.tsx` (dynamic provider select + per-provider key input)

## Out of scope (can do later)

- Image / embeddings endpoints — current proxy is chat-completions only.
- Per-key spend limits / rate limits — easy follow-up once usage tracking data is there.
- Fine-grained "which models are allowed" policies (today policy = keyword filter only).
