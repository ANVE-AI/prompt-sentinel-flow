# About AnveGuard

> The control layer between your application and every AI model.
> A drop-in, OpenAI-compatible proxy that inspects every prompt, enforces
> layered policies before the request leaves your network, and logs every
> call for audit — without changing your application code.

---

## What AnveGuard is

AnveGuard is a hosted reverse proxy for LLM APIs. Your application keeps
talking to the OpenAI Chat Completions API (or Anthropic Messages API), but
points its base URL at AnveGuard and uses an AnveGuard-issued key instead of
the raw provider key.

In return you get:

- A **central place** to store provider credentials (keys never leave the
  dashboard).
- A **layered policy engine** that runs on every request — normalizer,
  pattern detectors, behavioral heuristics, fuzzy/semantic keyword matching,
  intent classification — that can **block**, **flag**, or **sanitize**.
- A **full audit log** of every request and response (prompt, model, key,
  verdict per layer, latency, tokens, block reason).
- A **dashboard** to manage endpoints, keys, policies, routes, model aliases,
  templates, and observability — no redeploys.
- A **Playground** to send live prompts through the proxy and watch every
  policy layer decide in real time.

---

## Who it's for

- **Platform / security teams** who need governance over how their org uses
  LLMs without slowing teams down.
- **AI product teams** who want one place to swap models, enforce guardrails,
  and watch costs.
- **Compliance / audit** stakeholders who need a tamper-evident record of
  every model interaction.

---

## How it works

```
React dashboard (Clerk auth) ──HTTPS──▶ /functions/dashboard ──▶ Postgres (RLS, service-role only)
                                                                     │
Customer app ──Bearer ag_live_*──▶ /functions/proxy ──policy engine──▶ OpenAI / Anthropic / custom
                                       │
                                       └──▶ logs every request to request_logs
```

Two Supabase Edge Functions do the heavy lifting:

| Function | Auth | Purpose |
|---|---|---|
| `supabase/functions/proxy` | `Bearer ag_live_*` API key | Public OpenAI-compatible endpoint, runs the policy engine, forwards to upstream, logs every call. |
| `supabase/functions/dashboard` | Clerk session JWT | Action-router for the React app: CRUD on keys, endpoints, policies, logs, etc. |

Shared modules live in `supabase/functions/_shared`:
`policy_engine.ts` (layered evaluator), `anveguard.ts` (key auth + crypto +
Clerk JWT verify), `providers.ts`, `anthropic.ts`, `system_prompt.ts`,
`compress.ts`.

---

## Core concepts

### Endpoints
Upstream provider configurations. An endpoint stores the base URL, kind
(OpenAI-compatible or Anthropic), default model, model suggestions, optional
custom paths and headers, response format, path prefix, and the encrypted
provider API key. Endpoints can be **shared** with other workspace members
read- or write-only via `endpoint_shares`.

### API keys (AnveGuard keys)
Bearer tokens of the form `ag_live_…` that clients send to the proxy. Each
key is bound to a single endpoint and stores only a hash + 8-char prefix in
Postgres — the secret is shown once at creation. Keys carry per-key overrides
(model default, model suggestions, base URL override, auth scheme, custom
chat/models paths, extra headers, compression mode, admin flag).

### Policies (v2)
A composable system made of:

- **Policy settings** — global toggles per workspace (strict mode, intent
  shadow mode, heuristics, behavioral, patterns, injection guard,
  normalizer, compression, fuzzy/semantic keyword matching, severity tuning,
  token-spike alerts, guardrail system prompt).
- **Policy rules** — keyword, regex, or detector rules with severity,
  direction (request/response/both), and intent scoping.
- **Policy intents** — `block` / `flag` / `allow` actions per detected
  intent, with a min-confidence threshold.
- **Known intents** — labeled intents with examples and keywords used by
  the intent classifier.
- **Policy templates** — versioned bundles (settings + rules + intents)
  that can be applied, evaluated, or rolled back.

### Routes & route steps
Multi-hop routing: a route is an ordered list of `(endpoint, model)` steps
with timeout and fallback rules (on timeout, on 429, on 5xx).

### Model aliases
Per-key alias mapping: `alias → (target_endpoint, target_model)`. Lets you
expose a stable model name to apps and swap the actual upstream behind it.

### Request logs
Every request is recorded with: provider, model, status, latency, tokens
in/out, tokens saved (if compressed), verdict, verdict-per-layer breakdown,
block reason, detected intent + confidence, guardrail prompt used,
client-supplied system prompt, and the full message payload.

### Audit logs
Append-only record of dashboard actions (`action`, `target_type`,
`target_id`, `metadata`, `actor_user_id`).

### Rate limit buckets
A reusable Postgres-backed counter table keyed by `(scope, key)` with
configurable window length, used by the proxy and dashboard for abuse
control.

---

## Policy engine — the layered evaluator

Each request flows through layers in order; any layer can short-circuit with
a verdict. Layers and the controls that govern them:

1. **Normalizer** — canonicalises text (unicode, whitespace, casing) before
   detection so adversarial encoding tricks don't trivially bypass rules.
   Toggle: `enable_normalizer`.
2. **Patterns / detectors** — built-in detectors (PII, secrets, prompt
   injection signatures). Toggles: `enable_patterns`, `enable_injection_guard`,
   `injection_action`.
3. **Heuristics** — quick statistical checks (length, entropy, encoded
   ratio). Toggle: `enable_heuristics`.
4. **Behavioral** — per-key rolling profile (model churn, persona shifts,
   length spikes, encoded ratio drift) compared against `key_behavior_profiles`.
   Toggles: `enable_behavioral`, plus `behavioral_*` thresholds.
5. **Keyword rules** — exact + fuzzy + optional semantic matching against
   `policy_rules`. Toggles: `enable_fuzzy_keywords`, `enable_semantic_keywords`,
   `semantic_threshold`.
6. **Intent classifier** — classifies prompt intent against `known_intents`
   and dispatches to `policy_intents` (`block` / `flag` / `allow`) at or
   above `min_confidence`. Toggles: `enable_intent`, `intent_shadow_mode`
   (decisions are logged but not enforced).

Other policy controls:

- **Guardrail system prompt** — a server-controlled system prompt prepended
  to every request. `allow_client_system_prompt` and
  `system_prompt_max_length` govern client-supplied prompts.
- **Compression** — optional prompt compression
  (`enable_compression`, `compression_level`, `compression_min_chars`).
- **Token spike alerts** — `token_spike_*` settings + optional
  `token_spike_webhook_url` for outbound notifications.
- **Severity scoring** — configurable baseline window, volume dampening,
  and score cap for the anomaly score shown in the dashboard.
- **Strict mode** — when on, unknown configurations fail closed.

---

## Dashboard surfaces

Routes under `/dashboard`:

| Page | What it does |
|---|---|
| **Overview** | KPI hero, range-selectable traffic chart, latency + recent log insights, block-spike and token-spike banners, progress-aware **NextStepCard** ("next best step"), collapsible **HelpPanel** ("How to use AnveGuard") with copyable curl + OpenAI-SDK snippets. |
| **Endpoints** | CRUD over upstream endpoints, sharing, response-format / path-prefix / extra-headers / auth-scheme controls, "create AnveGuard key for this endpoint" shortcut, copyable test snippets. |
| **Keys** | Create / rotate / disable AnveGuard keys, per-key overrides (model default, model suggestions, base URL override, auth scheme, paths, extra headers, compression mode, admin flag), bulk-edit admin/compression. |
| **Providers** | Built-in provider catalog used to seed new endpoints. |
| **Routes** | Multi-step routing: ordered `(endpoint, model)` steps with timeout + fallback rules. |
| **Policies** | Guardrails (system prompt + client-prompt rules), Compression, Token alerts, Templates (with versioning + rollback), Known intents, and the V2 CRUD over rules and intent actions. |
| **Policies / Sandbox** | `evaluate_policy` against a sample prompt — see verdict and per-layer reasoning. |
| **Policies / Harness** | `run_policy_harness` — batch-run a policy bundle against a corpus of prompts. |
| **Logs** | Live request log with filters (status, key, model, time), per-row drawer with full payload, verdict-per-layer breakdown, and detected intent. |
| **Playground** | Two-pane REPL: pick a key, pick a model, send a prompt (streaming), watch the verdict + layers populate in real time. Includes a "Run test request" canned ping, key picker that surfaces unbound endpoints with a one-click "create a key" CTA, and per-key tooltips with full URL + last-used badge. |

Auxiliary surfaces:

- **First-run onboarding walkthrough** — auto-opens once on first dashboard
  visit; 3-step guided tour (Endpoints → Keys → Playground) with progress
  detection (already-done steps are marked). Replayable from the Overview.
- **Quickstart help panel** — self-contained, signed-out version of the
  walkthrough on the landing page and beneath the auth forms; includes
  per-provider example switcher (OpenAI / Anthropic / Perplexity / managed
  AI) and three discrete copy buttons (Proxy base URL, Auth header, Sample
  request).
- **Help links + "Replay quickstart" toast** — landing top bar Help link,
  hero "Replay quickstart" CTA that scrolls + flashes the Quickstart
  section and surfaces a dismissible "Need help?" toast linking to `/docs`.
- **Docs site** at `/docs`: Quickstart, Concepts, API keys, Endpoints,
  Routes, Policies, Logs, Proxy API reference, Errors, FAQ.

---

## Public proxy API

- Base URL: deployed at `https://api.anveguard.dev/v1` (production).
- Auth: `Authorization: Bearer ag_live_…`.
- Surfaces:
  - `POST /chat/completions` — OpenAI Chat Completions, streaming or
    non-streaming. Compatible with the official OpenAI SDKs.
  - `POST /messages` — Anthropic Messages, when the bound endpoint is of
    `kind = "anthropic"`.
  - `GET /models` — provider model list (proxied / cached).

The proxy emits structured streaming events that include verdict layers
inline so dashboards can render decisions without a second round-trip.

---

## Data model (Postgres)

Tables (all RLS-locked; access goes through the dashboard edge function
running with the service role):

- `endpoints`, `endpoint_shares`
- `api_keys`
- `policies`, `policy_settings`, `policy_rules`, `policy_intents`,
  `known_intents`, `policy_templates`, `policy_template_versions`
- `routes`, `route_steps`
- `model_aliases`
- `request_logs`, `audit_logs`
- `key_behavior_profiles`
- `rate_limit_buckets`
- `profiles` (Clerk user mirror)

Notable database functions:

- `has_role(user_id, role)` — security-definer role check (no recursive
  RLS). Roles live in their own table by design.
- `increment_rate_limit(scope, key, window_seconds)` — atomic windowed
  counter used by the proxy and dashboard.
- `claim_endpoint_shares(user_id, email)` — backfills `shared_with_user_id`
  when an invited user signs in.
- `validate_endpoint_response_format()` — trigger that constrains
  `response_format` to a known set.
- `prune_rate_limit_buckets()` — TTL cleanup.
- `update_updated_at_column()` — generic `updated_at` trigger helper.

---

## Authentication & access control

- **Dashboard** auth: Clerk session JWT, verified inside the edge function
  via `SUPABASE_JWKS` and Clerk's issuer.
- **Proxy** auth: `Bearer ag_live_…` keys, hashed at rest, prefixed for
  identification.
- **Encryption**: provider keys are encrypted at rest with
  `KEY_ENCRYPTION_SECRET`.
- **RLS**: every table denies all `anon` and `authenticated` access by
  default; the dashboard edge function uses the service role and enforces
  per-user filtering itself. The `audit_logs` table is append-only.
- **Sharing**: endpoints can be shared by email; `claim_endpoint_shares`
  binds the `user_id` on first sign-in.

---

## Observability

- **Live request log** (`request_logs`) with full payload + per-layer
  verdict breakdown.
- **Token spike alerts** with calibratable severity score (0–100) based on
  rolling baseline + volume dampening.
- **Block spike alerts** surfaced on Overview.
- **Audit log** of dashboard actions.
- **Per-key behavioral profile** tracked over rolling windows.
- **Webhook** outputs for token spikes (`token_spike_webhook_url`).

---

## Tech stack

**Frontend**
- Vite 5, React 18, TypeScript 5
- Tailwind CSS 3, shadcn/ui (Radix primitives), Lucide icons
- TanStack React Query 5, React Router 6, react-hook-form + zod
- Sonner toasts, recharts, date-fns
- Geist Sans / Geist Mono via `@fontsource`

**Auth**
- Clerk (`@clerk/clerk-react`)

**Backend**
- Supabase (Postgres + Deno Edge Functions)

**Tests & quality**
- Vitest (unit), Deno tests (edge functions), Playwright (e2e)
- ESLint, TypeScript strict

---

## Repository layout

```
src/
  components/             reusable UI (shadcn-derived)
    help-panel.tsx        collapsible "how it works" with copyable examples
    help-hint.tsx         small (i) tooltip beside labels
    next-step-card.tsx    progress-aware "next best step" on Overview
    onboarding-walkthrough.tsx  first-run dialog (Endpoints → Keys → Playground)
    quickstart-help-panel.tsx   signed-out copy-paste quickstart with provider switcher
    auth/AuthShowcasePane.tsx   right-hand pane of /sign-in and /sign-up
  pages/
    Landing.tsx, SignIn.tsx, SignUp.tsx
    dashboard/            Overview, Endpoints, Keys, Playground, Policies, Logs, Routes, Providers, PolicySandbox, PolicyHarness
    docs/                 Quickstart, Concepts, ApiKeys, Endpoints, Routes, Policies, Logs, ProxyApi, Errors, Faq
  lib/api.ts              dashboard action-router client
  integrations/supabase/  generated client + types (do not edit)

supabase/
  functions/
    proxy/                public OpenAI-compatible endpoint
    dashboard/            action router for the React app
    _shared/              policy_engine, providers, anthropic, anveguard (auth+crypto), system_prompt, compress
  config.toml             function-level config (e.g. verify_jwt)
```

---

## Running locally

Prerequisites: Node 22, a Supabase project, a Clerk app, Deno CLI for edge
function tests.

```bash
npm ci
cp .env.example .env   # fill VITE_SUPABASE_URL / PUBLISHABLE_KEY / PROJECT_ID
npm run dev            # http://localhost:8080
```

Edge-function secrets (`SUPABASE_SERVICE_ROLE_KEY`, `KEY_ENCRYPTION_SECRET`,
`SUPABASE_JWKS`, `CLERK_SECRET_KEY`, the managed-AI gateway key, …) live in
the Supabase project, **not** in `.env`.

Quality gates: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run e2e`.

---

## Glossary

- **AnveGuard key** — `ag_live_…` bearer secret your app uses against the
  proxy. Bound to a single endpoint.
- **Endpoint** — an upstream provider configuration (URL + provider key +
  defaults).
- **Policy rule** — one keyword, regex, or detector rule that contributes
  to the verdict.
- **Verdict** — the final decision (`allow` / `flag` / `block`) plus a
  per-layer breakdown.
- **Intent** — a classified category for a prompt; can map to an action
  via `policy_intents`.
- **Shadow mode** — layer runs and logs but does not enforce — used to
  tune intent rules without user impact.
- **Strict mode** — fail-closed posture for unknown configurations.
- **Severity score** — 0–100 anomaly score for a window of traffic, used
  by token spike alerts.

---

_Last updated: May 2026._
