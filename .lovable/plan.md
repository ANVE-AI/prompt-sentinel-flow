## Goal
Add a search box at the top of the desktop sidebar that filters dashboard nav items in-place, plus a "More results" affordance that opens the existing global command palette for cross-resource search (keys, endpoints, logs, etc.).

## Why this shape
- We already have a robust ⌘K palette (`src/components/command-palette.tsx`) for searching keys/endpoints/logs/policies. Duplicating that in the sidebar would be redundant.
- The sidebar specifically needs a *page finder* — fast, always-visible, scoped to navigation.
- When the sidebar is collapsed (icon rail), a full input would break the rail; we render a search icon button that fires the palette instead.

## Changes — `src/components/dashboard-sidebar.tsx`

1. **Lift the nav items** out of the JSX into the existing `groups` constant (already done) so the renderer can reuse them for filtered results.

2. **New state**: `const [query, setQuery] = useState("")` and a memoized `filteredGroups` that lowercases the query and keeps only items whose `label` or `to` includes it. Empty query → original groups untouched.

3. **Expanded state UI** (rendered above `SidebarContent`, inside a new `SidebarGroup` with no label):
   - A `relative` wrapper with a `Search` icon (lucide) absolutely positioned at left.
   - shadcn `<Input>` with `value={query}`, placeholder `"Find a page…"`, height `h-8`, left padding for the icon, right padding for a clear button.
   - When `query.length > 0`, show a small `X` button on the right that resets it.
   - Tiny keyboard hint `⌘K` chip on the right when empty (clickable → dispatch `COMMAND_PALETTE_EVENT`).

4. **Collapsed state UI**: instead of the input, render a single `SidebarMenuButton` with a `Search` icon and tooltip `"Search (⌘K)"`. Clicking dispatches the existing `COMMAND_PALETTE_EVENT` so behavior matches ⌘K.

5. **Filtered rendering**:
   - When `query` is empty: render groups exactly as today.
   - When `query` is non-empty: render a single `SidebarGroup` with label `"Pages"` containing the matched items (group headers hidden to keep results dense). If zero matches, render a muted empty state row: `"No pages match. Press Enter to search everything →"` and pressing Enter dispatches `COMMAND_PALETTE_EVENT` with the current query (palette already accepts a starting query via its input — for now we just open it; pre-filling can be a follow-up since it requires a tiny event payload change).

6. **Accessibility**: `role="search"` on the wrapper, `aria-label="Find a dashboard page"` on the input, keyboard shortcut hint via `aria-keyshortcuts`.

7. **Keyboard**: pressing `Esc` while the input is focused clears the query and blurs.

## No other files
- The palette already listens for `COMMAND_PALETTE_EVENT`. We reuse that.
- No new dependencies; `Search` and `X` icons come from `lucide-react`, `Input` from `@/components/ui/input`.

## Out of scope
- Pre-filling the palette's query from the sidebar input (requires extending the event payload + palette wiring; can be added later).
- Mobile sidebar search — `MobileSidebar` is a separate component; can mirror this pattern in a follow-up.
