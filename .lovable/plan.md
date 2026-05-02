## Endpoint sharing — collaborative read access without exposing keys

Today every endpoint is locked to its owner via `endpoints.user_id`, and the dashboard edge function gates every read/write with `.eq("user_id", userId)`. Provider credentials live in `endpoints.provider_key_encrypted` (AES-encrypted with `KEY_ENCRYPTION_SECRET`) and are never returned to the UI — only used inside the proxy.

We'll add an opt-in "share with teammate" model that lets an owner grant **read-only** access to a specific endpoint by email, without ever leaking the encrypted key or letting the recipient mint API keys against it.

---

### Data model

New table `endpoint_shares`:

```text
endpoint_shares
├─ id              uuid pk
├─ endpoint_id     uuid  → endpoints.id (cascade delete)
├─ owner_user_id   text  (Clerk id of the granter — denormalized for fast revoke)
├─ shared_with_email text (lower-cased)
├─ shared_with_user_id text NULL  (resolved from profiles.email on first access)
├─ permission      text  CHECK in ('read')   -- future-proofed, only "read" for now
├─ created_at      timestamptz default now()
└─ UNIQUE (endpoint_id, shared_with_email)
```

RLS: same deny-all pattern as `endpoints` (all access through edge function with service role).

Indexes on `(endpoint_id)`, `(shared_with_email)`, `(shared_with_user_id)`.

When a recipient first signs in, the existing profile-upsert path in `_shared/anveguard.ts` will also run a small "claim" step: `UPDATE endpoint_shares SET shared_with_user_id = $userId WHERE shared_with_email = $email AND shared_with_user_id IS NULL`.

---

### Server-side actions (in `supabase/functions/dashboard/index.ts`)

| Action | Who | What it does |
|---|---|---|
| `list_endpoint_shares` | owner | Returns all shares for one of the caller's endpoints. |
| `add_endpoint_share` | owner | Validates ownership, lower-cases email, blocks self-share, upserts share row. Pre-resolves `shared_with_user_id` from `profiles` if a matching user exists. |
| `remove_endpoint_share` | owner | Deletes one share row by id (must own the endpoint). |
| `list_shared_endpoints` | recipient | Returns endpoints shared **with** the caller — the **redacted** view (see below). |

All four actions reuse the existing Clerk auth middleware.

#### What recipients see (and what they don't)

`list_endpoints` is updated to merge two sources:

1. Endpoints the caller owns (unchanged shape).
2. Endpoints shared with the caller, returned with:
   - `is_shared: true`, `owner_email` (resolved via `profiles`),
   - `permission: "read"`,
   - All non-secret fields: `name`, `base_url`, `kind`, `auth_scheme`, `auth_header`, `response_format`, paths, `extra_headers`, `model_suggestions`, `default_model`, `created_at`.
   - **Stripped**: `provider_key_encrypted` is never selected; `has_key` is reported as a boolean only.

Every existing **mutating / sensitive** action gets a guard that requires *ownership* (not just access):
- `save_endpoint` (when `id` present), `delete_endpoint`, `set_endpoint_default_model`, `test_endpoint` — all keep the existing `.eq("user_id", userId)` filter, so a recipient simply cannot hit them.
- `list_endpoint_models` and a new read-only `inspect_shared_endpoint` action let recipients pull the live model list using the **owner's** stored key, but the key never leaves the edge function — only the resulting model array is returned.
- **Critical:** recipients cannot create an `api_key` bound to a shared endpoint. The existing `create_api_key` path (`endpoint_id` branch) verifies `endpoints.user_id = caller` — we keep that exact check, so shared endpoints are invisible to that code path. The UI on the recipient side will hide the "Use this endpoint to mint a key" button accordingly.

---

### UI changes (`src/pages/dashboard/Endpoints.tsx`)

1. **On each owned endpoint row**: a new **Share** icon button opens a small dialog:
   - Input for teammate email + Add button.
   - List of current shares with a "Revoke" trash icon.
   - Helper text: *"Recipients can view this endpoint and use it to debug, but they can't see your provider key, edit it, delete it, or attach API keys to it."*
2. **Saved endpoints table** gets a **Shared with me** section below the owner's list, showing the recipient view with a `Shared` badge, `read-only` chip, and disabled Edit/Delete/Share buttons. Test connection + list models stay enabled.
3. The endpoint editor drawer is opened in **read-only mode** when the row is shared — all inputs disabled, Save/Test save buttons hidden, model dropdown still works.

---

### Security checklist

- [x] `provider_key_encrypted` never selected in any query that returns rows to recipients.
- [x] Recipients cannot trigger `save_endpoint` / `delete_endpoint` / `set_endpoint_default_model` (existing owner filter unchanged).
- [x] Recipients cannot create API keys against shared endpoints (existing owner filter on `endpoints` lookup in `create_api_key` unchanged).
- [x] `test_endpoint` and `list_endpoint_models` for a shared endpoint are routed through a separate read-only action that resolves the owner's row by id+`shared_with_user_id` join, uses the owner's encrypted key server-side, and only returns the upstream response payload (no key material).
- [x] Self-share blocked.
- [x] Email is lower-cased + trimmed before insert and lookup.
- [x] `endpoint_shares` has deny-all RLS; only the edge function (service role) can read/write it.
- [x] On endpoint deletion, shares cascade-delete via FK.

---

### Migration

One migration that:
1. Creates `endpoint_shares` with the columns/indexes/constraints above.
2. Adds deny-all RLS policies for `anon` and `authenticated` (matching the `endpoints` table convention).
3. Creates a small SQL function `claim_endpoint_shares(_user_id text, _email text)` called from `ensureProfile` to back-fill `shared_with_user_id` after first login.

No changes to existing tables.

---

### Out of scope (could be follow-ups)

- Write/admin permission tier (schema already supports it — only `read` is wired now).
- Org/team objects (today shares are 1:1 owner→email).
- Email notification when a share is created (we just rely on it appearing in their dashboard).

Approve and I'll implement migration + edge function + UI together.