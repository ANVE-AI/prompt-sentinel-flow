# AnveGuard

> Drop-in OpenAI-compatible proxy that intercepts LLM requests, runs layered policy checks, and logs every call for audit.

AnveGuard sits between your application and any LLM provider (OpenAI, Anthropic, Gemini, custom). Every request is evaluated by a layered policy engine — **normalizer → patterns → heuristics → intent classifier** — that can block, flag, or sanitize. Every request and response is logged for audit, with a dashboard for keys, endpoints, policies, routing, and observability.

---

## Architecture

```
React dashboard (Clerk auth) ──HTTPS──▶ /functions/dashboard ──▶ Postgres (RLS, service-role only)
                                                                     │
Customer app ──Bearer ag_live_*──▶ /functions/proxy ──policy engine──▶ OpenAI / Anthropic / custom
                                       │
                                       └──▶ logs every request to request_logs
```

Two Supabase Edge Functions do the work:

| Function | Auth | Purpose |
|---|---|---|
| [`supabase/functions/proxy`](supabase/functions/proxy) | `Bearer ag_live_*` API key | OpenAI-compatible public endpoint, runs policy layers, forwards to upstream, logs every call |
| [`supabase/functions/dashboard`](supabase/functions/dashboard) | Clerk session JWT | Action-router for the React app: CRUD on keys/endpoints/policies/logs |

Shared modules live in [`supabase/functions/_shared`](supabase/functions/_shared): `policy_engine.ts` (layered evaluator), `anveguard.ts` (key auth + crypto + Clerk JWT verify), `providers.ts`, `anthropic.ts`, `system_prompt.ts`, `compress.ts`.

## Stack

- **Frontend:** Vite, React 18, TypeScript, Tailwind, shadcn/Radix, TanStack React Query, react-hook-form + zod, React Router 6
- **Auth:** [Clerk](https://clerk.com)
- **Backend:** [Supabase](https://supabase.com) — Postgres + Deno Edge Functions
- **Tests:** Vitest (unit), Deno tests (edge functions), Playwright (e2e)

## Getting started

### Prerequisites

- Node 22.x (`@types/node` is pinned to v22)
- A Supabase project (free tier works)
- A Clerk application (free tier works)
- Deno CLI (for running edge-function tests)

### Local dev

```bash
# 1. Install dependencies
npm ci

# 2. Configure env
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
# Edge-function secrets (SUPABASE_SERVICE_ROLE_KEY, KEY_ENCRYPTION_SECRET, etc.)
# go in your Supabase project, NOT in this .env.

# 3. Run the dev server
npm run dev          # http://localhost:8080
```

### Quality gates

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests
npm run build        # Production build
npm run e2e          # Playwright e2e (needs e2e/.env.e2e — see e2e/README.md)
```

Edge function tests:

```bash
cd supabase/functions
deno test --allow-env --allow-net --no-check
```

CI runs all of the above on every push and PR — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### Database

29 migrations in [`supabase/migrations`](supabase/migrations) define the schema. Apply with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Key tables: `profiles`, `api_keys`, `endpoints`, `request_logs`, `policy_settings`, `policy_rules`, `policy_intents`, `routes`, `audit_logs`, `key_behavior_profiles`. RLS is enabled on every table; service role is the only accessor (all access goes through audited edge functions).

## Deploy

This project is configured for [Lovable](https://lovable.dev) deployment with git sync — pushes to `main` trigger a Lovable build. Edge functions and migrations deploy via the Supabase CLI:

```bash
supabase functions deploy proxy dashboard
supabase db push
```

## Documentation

In-app docs live at [`/docs/*`](src/pages/docs) (Quickstart, Concepts, API reference, FAQs). For contributors:

- [`SECURITY.md`](SECURITY.md) — disclosure policy + security model
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev workflow, commit style, PR checklist
- `.lovable/plan.md` — Lovable's working notes (dev only)

## License

TBD.
