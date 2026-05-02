## Add time-range filter to the endpoint usage dialog

Add a **1h / 24h / 7d / 30d / All** range selector at the top of the Usage dialog. Both the **stats tiles** and the **Recent requests** list re-query and re-aggregate against the chosen window.

### Backend — `supabase/functions/dashboard/index.ts`

Extend the existing `endpoint_usage` action with an optional `range` parameter.

- Accepted values: `"1h" | "24h" | "7d" | "30d" | "all"`. Default: `"24h"`.
- Map to a `since` timestamp; when not `"all"`, add `.gte("created_at", sinceIso)` to the `request_logs` query.
- All downstream stats (`request_count`, `blocked_count`, `error_count`, `avg_latency_ms`, `last_request_at`) are computed from the windowed log set, so they automatically follow the filter.
- Response shape stays the same plus echoes `{ range, since }` so the client can show "since X" hints.
- `fetchCap` math is unchanged — it still bounds the query to ~1000 rows.

Invalid `range` values fall back to `"24h"` instead of erroring.

### Frontend — `src/pages/dashboard/Endpoints.tsx`

- New state: `const [usageRange, setUsageRange] = useState<"1h"|"24h"|"7d"|"30d"|"all">("24h")`.
- Include `usageRange` in the `usageQuery` `queryKey` and pass it via `query.range` so changing the selector triggers a refetch.
- Reset `usageRange` back to `"24h"` whenever a new endpoint is opened (so the dialog opens in a predictable state).
- UI: a small segmented control (5 ghost/outline buttons in a `border rounded-md` group) placed in the dialog header row — right next to the existing Refresh button. Active range gets `variant="default"`, others `variant="ghost"`.
- Subtle helper text under the stats grid: `"Showing data from the last 24 hours"` (or `"Showing all-time data"`), driven by the active range and the response's `since` field.
- Empty-state copy for **Recent requests** updates to mention the window: `"No requests in the last 1 hour."` / `"…all time."`.

### Out of scope

- No persistence of the chosen range across dialog opens (resets each time).
- No custom date range picker — fixed presets only.
- No change to `endpoint_request_detail` (drilldown still loads any historical request by id).

### Files touched

- `supabase/functions/dashboard/index.ts` — `endpoint_usage` accepts `range`, filters logs.
- `src/pages/dashboard/Endpoints.tsx` — range state, segmented control in dialog header, refreshed empty/helper copy.
