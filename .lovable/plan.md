# One-click bind: attach an existing AnveGuard key to an endpoint

Today an endpoint only shows up in the Playground if at least one `api_keys` row has its `endpoint_id` set to that endpoint. The only way to fix an "unbound" endpoint is to create a brand-new key. We'll add a fast path: pick an existing key you already own and bind it to the endpoint in one click.

## Backend — new dashboard action

File: `supabase/functions/dashboard/index.ts`

Add `bind_key_to_endpoint` action. Body: `{ key_id: string, endpoint_id: string }`.

Behavior:
- Verify both rows belong to `userId` (`api_keys.id` + `endpoints.id`).
- Reject if the key already has a different `endpoint_id` set unless `force: true` (avoid silently re-pointing a production key).
- Update the `api_keys` row, mirroring the same fields `create_key` already copies from an endpoint (so the proxy keeps reading from a single row):
  - `endpoint_id`, `provider = "custom"`, `custom_base_url`, `custom_models_url`, `custom_kind`, `custom_auth_scheme`, `custom_auth_header`, `custom_extra_headers`, `custom_model_suggestions`, `custom_path_prefix`, `custom_chat_path`, `custom_models_path`, `custom_response_format`, `provider_key_encrypted` (from the endpoint), and `model_default` if currently empty and the endpoint has a `default_model`.
- Write an `audit_logs` row (`action = "bind_key_to_endpoint"`, metadata: key name/prefix, endpoint name).
- Return `{ ok: true, key: { id, name, key_prefix, endpoint_id } }`.

Also add a small helper action `list_bindable_keys` taking `{ endpoint_id }` that returns this user's `api_keys` where `is_active = true` AND (`endpoint_id IS NULL` OR `endpoint_id = <that one>`), ordered by `created_at desc`. Used to populate the picker without overfetching.

## Playground — bind flow on unbound endpoints

File: `src/pages/dashboard/Playground.tsx`

Where today we show the warning surface and the "Create AnveGuard key for ..." button (lines ~322–342) and the empty-state cards (lines ~232–260), add a secondary action: **"Bind existing key"**.

Clicking it opens a small dialog:
- Title: `Bind a key to "{endpoint.name}"`
- Loads `list_bindable_keys` for that endpoint.
- If the list is empty: short message + the existing "Create new key" CTA.
- Otherwise: a single `Select` listing keys (`{name} · {key_prefix}…`) plus a confirm button.
- On success: invalidate the `keys` and `endpoints` queries, toast `"{key.name}" is now bound to "{endpoint.name}"`, and auto-select that key (`setSelection({ kind: "key", id })`) so the user can immediately Send.

## Endpoints page — bind action per endpoint

File: `src/pages/dashboard/Endpoints.tsx`

In the endpoint row (around line 1030, next to the Activity / Edit / Delete icon buttons), when `e.key_count === 0` and the row is owned (not shared), add a `Bind key` button. It opens the same dialog as the Playground flow. After success, refresh the endpoints list so the `key_count` badge updates.

## Out of scope

- No DB migrations — `api_keys.endpoint_id` already exists.
- Shared endpoints stay read-only (you can only bind keys you own to endpoints you own), matching the current `unboundEndpoints` rule in Playground.
- No bulk bind. One key at a time keeps the audit log honest.

## Files touched

- `supabase/functions/dashboard/index.ts` — two new action cases.
- `src/pages/dashboard/Playground.tsx` — bind dialog + secondary CTA.
- `src/pages/dashboard/Endpoints.tsx` — per-row Bind button reusing the dialog (extracted into `src/components/dashboard/BindKeyDialog.tsx`).
