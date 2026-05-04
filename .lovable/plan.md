## Goal

Save tokens (and money) by compressing the user-supplied messages before they reach the upstream provider, and make token consumption (with savings) visible on the Overview dashboard.

Two parts:
1. **Compression engine + controls** — wired into the proxy, configurable per workspace and overridable per API key.
2. **Token usage analytics** — new KPIs and chart on the Overview page (powered by existing `tokens_in`/`tokens_out` columns plus a new `tokens_saved`).

---

## 1. Database (migration)

Add columns to existing tables — no new tables needed.

`policy_settings` (workspace-level defaults):
- `enable_compression boolean not null default false`
- `compression_level text not null default 'balanced'` — `light | balanced | aggressive`
- `compression_min_chars integer not null default 400` — skip short prompts where overhead > savings

`api_keys` (per-key override):
- `compression_mode text not null default 'inherit'` — `inherit | off | light | balanced | aggressive`

`request_logs` (so we can chart savings):
- `tokens_saved_estimate integer` (nullable)
- `compression_applied boolean not null default false`

(All additive, safe defaults; no data migration required.)

---

## 2. Compression engine (`supabase/functions/_shared/compress.ts`, new)

Pure-text, deterministic, no extra LLM calls — keeps cost real:

- **Whitespace normalize**: collapse runs of spaces / blank lines.
- **Strip noise**: zero-width chars, repeated punctuation (`!!!!` → `!!`), redundant markdown bullets.
- **Dedupe**: drop identical consecutive lines, collapse repeated paragraphs (common in agent loops).
- **Quote trimming** (balanced+): truncate quoted blocks > N lines to head + `…[N lines omitted]…` + tail.
- **History summarization (aggressive only)**: when the conversation has >8 messages, replace the oldest middle messages with a short bulletized recap built from their first sentences. System messages are never compressed.

Exports:
```ts
compressMessages(messages, level): { messages, removedChars, originalChars, estimatedTokensSaved }
```
`estimatedTokensSaved = Math.round(removedChars / 4)` (industry rule of thumb; matches what we already use for tokenizer-free estimates elsewhere).

Includes a small `compress.test.ts` covering each level + a no-op case.

---

## 3. Proxy wiring (`supabase/functions/proxy/index.ts`)

After sanitization (around line 794) and **before** building `attempts` / `forwardBody`:

1. Resolve effective level: `keyRow.compression_mode === 'inherit' ? settings.compression_level : keyRow.compression_mode` (and `off` short-circuits).
2. Skip if disabled at workspace AND key inherits, or if total prompt chars < `compression_min_chars`.
3. Run `compressMessages`. If `estimatedTokensSaved > 0`:
   - Replace `body.messages` with the compressed copy (the upstream call uses fewer tokens).
   - Set `logBase.tokens_saved_estimate` and `logBase.compression_applied = true`.
   - Add an `x-anveguard-compression` debug header to the proxy response with `level` + `saved` so SDK users can verify.

System prompts and tool-call messages are passed through unchanged (compression is content-only).

---

## 4. Dashboard backend (`supabase/functions/dashboard/index.ts`)

`stats` action (around line 2040):
- Include `tokens_in`, `tokens_out`, `tokens_saved_estimate`, `compression_applied` in the select.
- Compute and return:
  - `tokens_in_total`, `tokens_out_total`, `tokens_saved_total`
  - `compressed_requests` count
  - `chart[].tokens_in`, `chart[].tokens_out`, `chart[].tokens_saved` per day bucket (already bucket loop exists — just sum).

New action `update_compression_settings` (workspace) and extension to existing key update action to accept `compression_mode`. Both write to `audit_logs` for parity with the existing system_prompt audit trail (uses the same audit pattern already in place).

---

## 5. Dashboard UI

**`src/pages/dashboard/Overview.tsx`** — extend the hero KPI strip from 4 satellites to 5 by adding a “Tokens used” tile (`tokens_in_total + tokens_out_total`, sub-line: `~X tokens saved via compression`). Add a second small chart card below the existing traffic chart titled **“Token usage”** with two areas (`tokens_in`, `tokens_out`) and a thin overlaid line for `tokens_saved`. Re-uses the existing recharts setup.

**`src/pages/dashboard/Policies.tsx`** — new “Token compression” section with: toggle (Enable), select (Light / Balanced / Aggressive), and min-chars input. Help text explains it never touches system prompts.

**`src/pages/dashboard/Keys.tsx`** — per-key “Compression” select column (`Inherit / Off / Light / Balanced / Aggressive`) and a row action; reuses the existing bulk-action bar pattern from the system_prompt feature so users can flip many keys at once.

---

## Technical notes

- No new dependencies. Compression is hand-written TS, easy to audit and ship to Deno.
- Deterministic + reversible-in-meaning: aggressive level is opt-in because the history recap is lossy.
- Token counts come from the upstream provider (already parsed in proxy `usage`). `tokens_saved_estimate` is intentionally an estimate (chars/4); we label it as such in the UI tooltip.
- Audit logging reuses the existing `audit_logs` table and matches the format used by the recent system_prompt work.

---

## Files to change

- migration: add columns described in §1
- new `supabase/functions/_shared/compress.ts` + `compress.test.ts`
- edit `supabase/functions/proxy/index.ts` (apply compression + log fields)
- edit `supabase/functions/dashboard/index.ts` (stats payload, settings action, key update, audit entries)
- edit `src/pages/dashboard/Overview.tsx` (KPI tile + token chart)
- edit `src/pages/dashboard/Policies.tsx` (workspace controls)
- edit `src/pages/dashboard/Keys.tsx` (per-key control + bulk action)
