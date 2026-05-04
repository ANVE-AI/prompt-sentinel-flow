## Goal

Make the **Endpoints** page feel like a real "pick your provider" experience instead of a blank form, and bring back the **Simple mode** alongside the existing **Advanced mode**.

Today the page only has the advanced form; provider templates are buried in a select dropdown inside the create dialog. We also have presets defined in two different places that don't agree:
- `PROVIDERS` (in `supabase/functions/_shared/providers.ts`) — built-in providers (Lovable managed, OpenAI, OpenRouter, Anthropic, Perplexity, Kimi, Qwen).
- `CUSTOM_SCHEMA.templates` — quick-start templates used by the form (Ollama, vLLM, Azure, Groq, Anthropic, OpenRouter, Together, Fireworks, xAI, Mistral, DeepSeek, OpenAI Responses).

Notably **Gemini, Perplexity, and Lovable managed are missing from the templates list**. We'll align both.

---

## Changes

### 1. Add missing provider templates (backend)

In `supabase/functions/_shared/providers.ts → CUSTOM_SCHEMA.templates`, add:

- **Lovable AI (managed)** — uses `https://ai.gateway.lovable.dev`, no key needed (auth_scheme: `none`), flagged `managed: true` so the UI hides the API-key field.
- **OpenAI (Chat Completions)** — base `https://api.openai.com`, prefix `/v1`, model `gpt-5-mini`.
- **Google Gemini** — base `https://generativelanguage.googleapis.com`, prefix `/v1beta/openai`, chat `/chat/completions`, models `/models`, bearer auth, default `gemini-2.5-flash`.
- **Perplexity (Sonar)** — base `https://api.perplexity.ai`, default `sonar`.

Add an optional `managed?: boolean` and `category?: "managed" | "hosted" | "self_hosted"` flag on template entries so the gallery can group them and skip the key prompt for managed ones.

### 2. Endpoints page — provider gallery

In `src/pages/dashboard/Endpoints.tsx`, above "Saved endpoints", add a **"Add an endpoint"** section that renders templates as a card grid grouped by category:

```text
Managed                 Hosted providers              Self-hosted
[ Lovable AI ]          [ OpenAI ]  [ Anthropic ]    [ Ollama ]
                        [ Gemini ]  [ Perplexity ]   [ vLLM / LM Studio ]
                        [ OpenRouter ] [ Groq ]      
                        [ xAI Grok ] [ Mistral ]
                        [ DeepSeek ] [ Together ]
                        [ Fireworks ] [ Azure OpenAI ]
                        [ OpenAI Responses ]
```

Each card shows: provider logo/initial, name, one-line description, and a "+ Add" button. Clicking opens the create dialog **pre-filled with that template** and pre-switched to **Simple mode**.

A "Custom endpoint" card at the end opens the dialog blank in **Advanced mode** (today's behavior).

### 3. Simple vs Advanced mode in the create/edit dialog

Add a Tabs control at the top of the dialog: `Simple | Advanced`.

- **Simple mode** (default for template-based creation):
  - Name (prefilled, editable)
  - Provider key (only field that really matters — hidden when template is `managed`)
  - Default model (Select populated from `model_suggestions`, with "Refresh from server" button)
  - Read-only summary chip showing base URL + auth scheme so the user knows what's wired up
  - "Test connection" button
- **Advanced mode** (today's full form):
  - All current fields: kind, base_url, path_prefix, chat_path, models_path, models_url, auth_scheme, auth_header, extra_headers, response_format, model_suggestions, etc.
  - Template diff/preview UI stays here.

Switching modes preserves form state. Editing an existing endpoint defaults to Advanced (since users editing usually want full control); a "Switch to simple" link is available if the endpoint cleanly maps to a known template.

### 4. Empty state + entry points

- Keep the "+ New endpoint" header button → opens the dialog in Advanced mode (custom).
- Replace the current empty state with a CTA pointing to the new gallery: "Pick a provider above, or create a custom endpoint."

---

## Technical notes

- No DB schema changes. Templates are static config returned by `list_providers`.
- `managed` templates: when applied, `auth_scheme = "none"` and the `provider_key` field is hidden in Simple mode. The proxy already routes managed providers via `LOVABLE_API_KEY` server-side (existing `lovable` provider behavior in `resolveEndpoint`), so for the managed template we'll set `kind: "lovable_managed"` *or* simply rely on the existing `lovable` built-in provider id rather than a custom endpoint. Decision: for the gallery card "Lovable AI", instead of creating a custom endpoint, persist it as `provider: "lovable"` (built-in) — this avoids duplicating managed-key plumbing. The card just creates an `endpoint` row that points at the built-in Lovable provider.
- `category` field is UI-only, safe to add to `CUSTOM_SCHEMA.templates`.
- Mode toggle state lives in component state (`"simple" | "advanced"`), defaulted based on entry point. Field validation already covers both modes; no schema changes needed.
- Tests: existing `index_test.ts` for proxy is unaffected. We'll do a quick manual smoke through the dashboard after deploy.

---

## Out of scope

- Per-template provider logos (we'll use lucide icons + colored initial badge for now).
- Re-doing the Providers.tsx page (kept as-is; it groups already-saved endpoints).
