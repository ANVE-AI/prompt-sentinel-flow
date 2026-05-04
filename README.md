# AnveGuard (prompt-sentinel-flow)

Drop-in OpenAI-compatible proxy that intercepts LLM requests, runs layered policy checks (normalizer → patterns → heuristics → intent classifier), and logs every call for audit.

Built with Vite + React + TypeScript + Tailwind/shadcn, Clerk auth, and Supabase (Postgres + Deno edge functions: `proxy/` and `dashboard/`).
