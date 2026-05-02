# AnveGuard MVP — Build Plan

A drop-in `/v1/chat/completions` proxy that authenticates with AnveGuard-issued API keys, applies keyword guardrails, forwards to either Lovable AI or OpenAI, and logs every interaction to a dashboard.

## 1. Auth (Clerk)
- Integrate `@clerk/clerk-react` for sign-in / sign-up / user button.
- You'll need to provide your **Clerk Publishable Key** (and a **Clerk Secret Key** stored as a backend secret so the edge function can verify dashboard requests).
- Dashboard routes (`/dashboard/*`) gated behind `<SignedIn>`; landing page is public.

## 2. Database (Lovable Cloud)
Tables:
- `profiles` — mirrors Clerk user (`clerk_user_id` PK, email, created_at).
- `api_keys` — `id`, `user_id`, `name`, `key_hash`, `key_prefix`, `provider` (`lovable` | `openai`), `provider_key_encrypted` (nullable; required if provider=openai), `model_default`, `is_active`, `created_at`, `last_used_at`.
- `policies` — one row per user: `blocked_keywords[]`, `allowed_keywords[]`, `use_global_defaults` (bool), `block_message`.
- `request_logs` — `id`, `user_id`, `api_key_id`, `provider`, `model`, `messages` (jsonb), `response` (jsonb), `status` (`allowed` | `blocked_input` | `blocked_output` | `error`), `block_reason`, `latency_ms`, `tokens_in`, `tokens_out`, `created_at`.
- Global defaults: hardcoded blocked-term seed list (e.g. obvious unsafe categories) merged in at proxy time when `use_global_defaults=true`.

RLS: users can only read/write their own rows. The proxy edge function uses the service role to bypass RLS after validating the AnveGuard API key.

## 3. Proxy edge function — `POST /functions/v1/v1/chat/completions`
Public function (no JWT). Flow:
1. Read `Authorization: Bearer ag_...` header → look up `api_keys` by `key_hash`.
2. Validate request body matches OpenAI chat-completions shape.
3. Load user's `policies` (+ global defaults if enabled). Scan all `messages[].content` for blocked keywords (case-insensitive substring). On hit → log `blocked_input`, return `{error: {message: block_message, type: "policy_violation"}}` with 200 in OpenAI shape so SDKs don't crash.
4. Forward:
   - `provider=lovable` → `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`.
   - `provider=openai` → `https://api.openai.com/v1/chat/completions` with the user's stored OpenAI key (decrypted).
5. Streaming and non-streaming both supported (pass `stream` through; for streaming, tee chunks to accumulate the final text for output policy check + logging).
6. Run output keyword scan on the assistant message. On hit → replace `choices[0].message.content` with safe fallback, mark `blocked_output`.
7. Insert a row into `request_logs`, update `last_used_at`. Return final response in identical OpenAI format.

## 4. Dashboard pages

**Landing `/`** — product pitch, "AI Firewall for LLM Apps", code-snippet showing how to swap a base URL, sign-in CTA.

**`/dashboard`** — overview cards: total requests (24h / 7d), blocked count, active keys, requests-over-time sparkline, top blocked keywords.

**`/dashboard/keys`** — list API keys (showing only `ag_xxxx…last4`), Create-key dialog (name, provider, default model, paste OpenAI key if applicable). Newly created key shown **once** with copy button. Revoke action.

**`/dashboard/policies`** — toggle global defaults; two textareas (one term per line) for blocked / allowed keywords; custom block message; Save.

**`/dashboard/logs`** — paginated table (timestamp, key, model, status badge, latency). Row click → drawer with full prompt + response JSON, block reason if any. Filters: status, key, date range, free-text search.

**`/dashboard/playground`** — quick form: pick a key, type a prompt, send through the proxy, render result + whether policy fired. Useful for confirming setup.

## 5. Integration snippet (shown in dashboard)
```
base_url = "https://<project>.functions.supabase.co/v1"
api_key  = "ag_live_xxx"
# Drop-in: any OpenAI SDK works unchanged
```

## Technical notes
- API keys: generate `ag_live_` + 32 random bytes base62. Store SHA-256 hash + first 8 chars as prefix for display. Only show full key on creation.
- OpenAI keys at rest: encrypt via AES-GCM using a `KEY_ENCRYPTION_SECRET` (we'll add as a project secret).
- Clerk → Cloud bridge: frontend passes Clerk JWT to a small `whoami` edge function that upserts `profiles` and returns a short-lived Supabase JWT (signed with project JWT secret) so the dashboard can read its own rows under RLS. Alternatively, every dashboard query goes through edge functions that verify the Clerk JWT directly — we'll use the latter to keep it simple and avoid JWT minting.
- Streaming policy check: parse SSE deltas, accumulate, run check at `[DONE]`; if violation, append a final SSE event with the safe fallback (best-effort, since earlier tokens already streamed — we'll document this limitation in the dashboard).
- Stack: React + Vite + Tailwind + shadcn (existing), Clerk, Lovable Cloud (Postgres + edge functions), Lovable AI Gateway, recharts for the overview chart.

## Out of scope (per PRD)
Multi-provider load balancing, rate limits, cost tracking, RBAC, AI-based filtering, red-teaming.

## What I need from you on approval
1. Clerk Publishable Key + Secret Key.
2. Confirmation to enable Lovable Cloud (for DB + edge functions + Lovable AI).