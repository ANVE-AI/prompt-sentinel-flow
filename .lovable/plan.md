## Add inline "Revoke key" action to the endpoint usage dialog

Owners can revoke any active API key directly from the **Bound API keys** list inside the Usage dialog, with an explicit confirmation step. No backend changes — the existing `revoke_key` action already enforces ownership and idempotency.

### Frontend — `src/pages/dashboard/Endpoints.tsx`

**State + mutation** (added near the existing `usageQuery`):

- `const [confirmRevokeKey, setConfirmRevokeKey] = useState<{ id: string; name: string; key_prefix: string } | null>(null)`
- `useMutation` calling `call("revoke_key", { body: { id } })`.
  - `onSuccess`: toast "Key revoked", invalidate `["endpoint_usage"]` and `["keys"]`, close confirm dialog.
  - `onError`: toast the server error (`revoke_key` returns clear messages like "This key has been revoked.").

**Bound API keys row UI** (the `usageRow.keys.map(...)` block):

- Move `last_used_at` text into a `flex-1` middle area so the right side can hold the action.
- For active keys, render a small destructive ghost button: `<Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmRevokeKey({ id, name, key_prefix })}><Ban className="h-3.5 w-3.5 mr-1" />Revoke</Button>`.
- For revoked keys, no button — the existing "revoked" badge stays.

**Confirmation dialog** (new `<AlertDialog>` rendered alongside the Usage dialog, after it):

- Title: `Revoke API key?`
- Body: `"`{name}`" (`{key_prefix}…`) will stop working immediately. Any application or service using it will start receiving 401 errors. This action cannot be undone.`
- Cancel + destructive Confirm button (`bg-destructive text-destructive-foreground`).
- Confirm calls `revokeKeyMutation.mutate(confirmRevokeKey.id)`; button shows spinner via `disabled={revokeKeyMutation.isPending}`.

### Out of scope

- No backend changes — `revoke_key` already exists and is owner-scoped.
- No bulk revoke.
- No "undo" — revocation is permanent (server-enforced).
- Shared-with-me endpoints: the recipient view does not surface this action (only owners reach the Usage dialog with bound keys).

### Files touched

- `src/pages/dashboard/Endpoints.tsx` — new state + mutation, inline Revoke button per active key, AlertDialog confirmation.
