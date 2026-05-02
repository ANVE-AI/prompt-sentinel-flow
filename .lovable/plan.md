## Goal
The desktop sidebar's collapsed/expanded state should survive page reloads.

## Current state
- `src/pages/dashboard/DashboardLayout.tsx` renders `<SidebarProvider defaultOpen>` — always starts expanded, ignoring any prior toggle.
- The shadcn `SidebarProvider` already writes a `sidebar:state` cookie on toggle, but `defaultOpen` overrides the initial render before any cookie/localStorage read occurs in the SPA.
- Mobile state is handled separately by `MobileSidebar` and is not affected.

## Change
Convert `DashboardLayout` to control `SidebarProvider` with `open` / `onOpenChange`, backed by `localStorage` under the key `dashboard:sidebar:open`.

1. Read the persisted value lazily in `useState` initializer:
   - If `localStorage.getItem("dashboard:sidebar:open") === "false"` → start collapsed.
   - Otherwise (missing, `"true"`, or SSR/no-window) → start expanded.
2. On `onOpenChange`, update React state and `localStorage.setItem(...)`.
3. Wrap reads/writes in `try/catch` to handle private-mode / disabled storage gracefully.

That's the entire change — one file, ~10 lines. The existing `DashboardSidebar` and the toggle button in `Topbar` already call `toggleSidebar()` from context, so they automatically flow through the new controlled handler.

## Why localStorage over the built-in cookie
The shadcn cookie (`sidebar:state`) is written but never read on the client; reading it would require parsing `document.cookie` on every mount and is brittle with SameSite/secure flags in preview iframes. `localStorage` is a single line, synchronous, and scoped to the dashboard.

## Out of scope
- Mobile sheet state (intentionally session-only).
- Per-user server-side persistence (not requested; would require a profile column).
