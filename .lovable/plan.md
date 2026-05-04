# Make endpoints visible in the Playground

## The problem

Today the Playground only lists rows from `api_keys`. Your Perplexity **endpoint** exists, but no AnveGuard key is bound to it, so the dropdown looks empty for that provider. There's no signal that the endpoint exists or how to use it.

## What I'll change

### 1. Show endpoints alongside keys in the Playground picker

The "Key (for model list)" select becomes an **Endpoint / Key** picker with two grouped sections:

```text
─ Your AnveGuard keys ─
  Adarsh Kant — lovable

─ Configured endpoints (no key yet) ─
  Perplexity (Sonar) — api.perplexity.ai · sonar           [ Bind a key ]
```

- Endpoints with at least one bound active key only appear in the "keys" group (no duplication).
- Endpoints with **zero** bound keys appear in the second group with an inline "Bind a key" CTA.
- Selecting an unbound endpoint disables the **Send through proxy** button and shows a small banner:

  ```text
  This endpoint has no AnveGuard key yet. Create one to send requests through the proxy.
  [ Create AnveGuard key for "Perplexity (Sonar)" ]
  ```

  Clicking navigates to `/dashboard/keys?new=1&endpoint=<id>&name=<endpoint name>` (the existing prefilled-key flow already supports this).

### 2. Empty-state for users with endpoints but zero keys

If `activeKeys.length === 0` but the user has endpoints, replace today's silent "no keys" state with:

```text
You have 1 endpoint configured but no AnveGuard keys yet.
Create a key bound to "Perplexity (Sonar)" to start testing.
[ Create key ]
```

### 3. Auto-select after returning from key creation

Accept `?key=<id>` on `/dashboard/playground` so after creating a key from the Endpoints/Keys flow, the new key is preselected and the model list loads immediately.

### 4. Better labels in the dropdown

For custom-endpoint-bound keys, show the **endpoint name** instead of just `custom`:

```text
my-perplexity-key — Perplexity (Sonar)
```

This requires `list_keys` to also return `endpoint_id` and the joined `endpoints.name` so the label is exact rather than reconstructed from `custom_base_url`.

## Technical notes

- **No DB migration.** `api_keys.endpoint_id` and the `custom_*` mirror columns already exist; `create_key` already accepts `endpoint_id`.
- **Edge function `dashboard/index.ts`**:
  - `list_keys`: extend the select to include `endpoint_id`, then do a second query against `endpoints` for the referenced ids and merge `endpoint_name` into each row. (No JOIN to keep RLS-bypass logic simple — it's the pattern used elsewhere in this file.)
- **Frontend `src/pages/dashboard/Playground.tsx`**:
  - Add a `useQuery(["endpoints"], () => call("list_endpoints"))` call.
  - Compute `unboundEndpoints = endpoints.filter(e => !keys.some(k => k.endpoint_id === e.id))`.
  - Render the picker as a `<Select>` with two labeled groups (`SelectGroup` + `SelectLabel`) covering bound keys and unbound endpoints.
  - When the selected value is an unbound endpoint id (prefixed `ep:` to disambiguate from key ids), disable Send and render the inline CTA.
  - Read `?key=<id>` on mount to auto-select.
- **No changes** to `proxy/index.ts`, providers, or auth.

## Verification

After implementation I'll:
1. Confirm the Perplexity endpoint shows up in the picker for your account with the "Bind a key" CTA.
2. Walk the link → Keys page opens with the endpoint preselected → create a test key → land back in Playground with the new key auto-selected.
3. Confirm `list_models` returns Perplexity sonar models for the new key.
