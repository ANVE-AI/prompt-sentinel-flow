## Add request drilldown to the usage dialog

Each row in the **Recent requests** list inside the Usage dialog becomes clickable. Clicking opens a side drawer showing the full prompt messages, full response payload, status, latency, token counts, and block reason for that request — fetched on demand so we don't bloat the initial usage payload.

### UX

- Recent request rows get a hover state, a chevron, and become buttons.
- Click → opens a `Sheet` (right-side drawer) over the dialog titled "Request · {time} · {model}".
- Drawer body has:
  - Header strip: status badge (ok / blocked / error), timestamp, latency, tokens in/out, model, provider, API key name.
  - **Block reason** callout (only when `status` starts with `blocked` and `block_reason` is present), in destructive-tinted card.
  - Tabs: **Prompt** | **Response** | **Raw**.
    - Prompt: rendered list of `messages[]` (role badge + collapsible content per message); falls back to JSON viewer if shape is unexpected.
    - Response: pretty-printed assistant message text when extractable, plus collapsible full JSON.
    - Raw: full `request_logs` row as syntax-highlighted JSON with a "Copy" button.
  - Empty / loading / error states.

### Backend — `supabase/functions/dashboard/index.ts`

Add a new action `endpoint_request_detail`:
- Inputs: `request_id` (uuid), optional `endpoint_id` for an extra ownership check.
- Auth: existing Clerk userId guard.
- Query: `select * from request_logs where id = :id and user_id = :userId limit 1`.
- Extra safety: if the log has `api_key_id`, verify the key's `endpoint_id` belongs to an endpoint owned by the user (covers the shared-endpoint case — shared recipients are explicitly NOT given log access; only the owner can drill in).
- Returns `{ request: {...full row including messages + response} }` or 404.

No schema changes needed — `request_logs.messages` and `request_logs.response` already exist as `jsonb`.

### Frontend — `src/pages/dashboard/Endpoints.tsx`

- Add state: `const [openRequestId, setOpenRequestId] = useState<string | null>(null)`.
- Add `useQuery` keyed on `["endpoint_request_detail", openRequestId]`, enabled when set, calling the new action.
- Replace the static row `<div>` (lines ~1611-1630) with a `<button>` that calls `setOpenRequestId(r.id)`.
- New `<Sheet>` component rendered alongside the dialog (Sheet sits above Dialog z-index by default in shadcn).
- Reuse existing `Badge`, `Tabs`, `ScrollArea`, `Ban`, `AlertCircle`, `Check`, `Copy` icons already imported.
- Helper `extractAssistantText(response)` that handles `chat_completions` (`choices[0].message.content`), `responses` (`output_text` / `output[0].content[0].text`), and `anthropic_messages` (`content[0].text`).

### Out of scope

- No edits for shared-with-me endpoints (they don't have request log access).
- No bulk export — single-request inspection only.
- No streaming reconstruction beyond what's already stored in `response`.

### Files touched

- `supabase/functions/dashboard/index.ts` — add `endpoint_request_detail` case.
- `src/pages/dashboard/Endpoints.tsx` — clickable rows + drawer + query.
