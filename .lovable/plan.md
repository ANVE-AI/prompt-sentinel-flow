## Add "Top models" section to the endpoint usage dialog

Show which models actually got hit through this endpoint within the active time window, ranked by request count, with latency and error stats per model.

### Backend — `supabase/functions/dashboard/index.ts` (`endpoint_usage` action)

Compute a `top_models` array per endpoint from the same windowed `epLogs` set already in scope (no extra query, no schema changes):

- Group by `model` (skip rows where `model` is null/empty → bucket as `"(unknown)"`).
- For each group: `request_count`, `blocked_count`, `error_count`, `avg_latency_ms`, `tokens_in_total`, `tokens_out_total`, `last_request_at`.
- Sort by `request_count` desc, take top 8.
- Add to the per-endpoint payload as `top_models`.

Response shape stays additive — existing fields untouched.

### Frontend — `src/pages/dashboard/Endpoints.tsx`

New section in the Usage dialog, placed **between "Bound API keys" and "Recent requests"**:

- Heading: `Top models ({usageRow.top_models.length})`.
- Empty state when zero (uses windowed copy: `"No model activity in the last 24 hours."`).
- Otherwise a compact table-like list (`rounded-md border divide-y`):
  - Left: rank dot · model id (truncated, monospace).
  - Middle: small badges for blocked/error counts (only when > 0, destructive tinting).
  - Right (right-aligned, tabular-nums): `{request_count} req · {avg_latency_ms}ms`.
  - Optional second line under model id (text-[10px] muted): `tokens in/out` totals when present.
- Reuses existing `Badge`, no new icons or shadcn components needed.

### Out of scope

- No clicking a model to filter the recent list.
- No charting — text/list only.
- No cost estimation.

### Files touched

- `supabase/functions/dashboard/index.ts` — compute + return `top_models` per endpoint in `endpoint_usage`.
- `src/pages/dashboard/Endpoints.tsx` — render the new section in the Usage dialog.
