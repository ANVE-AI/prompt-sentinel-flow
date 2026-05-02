
# AnveGuard — YC-Grade UI/UX Pass

The design system foundations from the prior revamp are in place (Electric Indigo tokens, Geist, scanline rail, `PageHeader`/`KeyValue`/`EmptyState`/`Badge status`, sticky `Topbar`, REPL Playground, KPI Overview). What's still rough — and what makes a product feel "YC Demo Day quality" vs "AI-generated" — is the **last 20%**: a coherent landing page, real density on data-heavy pages, a command palette, mobile shell, consistent loading/empty states, and visible craft touches (kbd shortcuts, copy affordances, micro-animation).

This plan finishes that 20% in one focused pass.

---

## 1. Landing page — rewrite (`src/pages/Landing.tsx`)

Current page still uses `bg-gradient-to-r from-primary to-accent`, `text-gradient`, `shadow-glow`, the macOS code window, and a 6-feature grid. That's the cliché we set out to remove.

Rewrite into 5 sections, all using existing tokens:

```text
┌───────────────────────────────────────────────────────────┐
│  Sticky nav: Logo · Product / Docs / Pricing · Sign in    │
├───────────────────────────────────────────────────────────┤
│  HERO  (left)                    │  PIPELINE DIAG (right) │
│  Eyebrow chip "AI Firewall"      │  your-app → ▢AnveGuard │
│  display-xl headline (flat fg)   │       → ▢ provider     │
│  Sub copy · Two CTAs             │  (one row pulses with  │
│  Trust row: provider logos       │   the scanline motif)  │
├───────────────────────────────────────────────────────────┤
│  TABBED SNIPPET   [Python] [Node] [curl]                  │
│  Flat surface-1 card · no traffic-light dots              │
├───────────────────────────────────────────────────────────┤
│  3 NARRATIVE BLOCKS (Inspect / Enforce / Audit)           │
│  Each: text left · real product screenshot right          │
├───────────────────────────────────────────────────────────┤
│  PIPELINE / "How it works" — thin SVG diagram             │
├───────────────────────────────────────────────────────────┤
│  CTA band + minimal single-row footer                     │
└───────────────────────────────────────────────────────────┘
```

Specifics:
- Drop every `bg-gradient-*`, `text-gradient`, `shadow-glow`, `bg-hero` use.
- Headline uses flat `text-foreground` at `text-display-xl`. The only "gradient" is the scanline animation in the pipeline diagram.
- Snippet tabs: a `Tabs` component, mono code in `surface-2`, copy button top-right.
- Narrative blocks use real cropped screenshots of `/dashboard/logs`, `/dashboard/playground`, `/dashboard/policies` (placeholders OK initially via `public/placeholder.svg`-style stubs we generate as small SVG mocks).
- Footer collapses to one row: small Logo, copyright, status dot ("All systems operational").

## 2. Auth pages two-pane (`src/pages/SignIn.tsx`, `SignUp.tsx`)

Current pages are centered Clerk widgets on a flat background. Move to a two-pane layout:

```text
┌────────────────────┬───────────────────────────────────┐
│  Form pane (480px) │  Showcase pane (flex)             │
│  Logo + tagline    │  Live "Recent requests" preview   │
│  Clerk component   │  rendered with mocked log rows +  │
│                    │  scanline. Sells the product.     │
└────────────────────┴───────────────────────────────────┘
```

Mocked preview is a static component (no API calls) so it works pre-auth. Stacks vertically below `lg`.

## 3. Density + craft pass on data pages

### Keys (`src/pages/dashboard/Keys.tsx`)
- Replace `Card` per-key with a 36px-row table-style list using a CSS-grid template: `[name 1fr | endpoint · model 240px | created 120px | status 80px | actions 40px]`.
- Use `KeyValue` in the create-key dialog instead of free `<Label>` rows.
- Show key fingerprint (first 8 chars) in mono after revoking, so revoked keys are still recognizable in audit cross-reference.
- Add a copy-to-clipboard affordance with a 600ms "Copied" inline confirmation (no toast for in-row copy — toast is reserved for state changes).

### Endpoints (`src/pages/dashboard/Endpoints.tsx`)
- Same row treatment as Keys: `[name | base_url mono | provider kind | last used | usage chip | actions]`.
- Convert the usage dialog to a right-anchored `Sheet` 640px wide (mirrors the Logs detail sheet → muscle memory).
- Replace the bespoke "test endpoint" inline panel with a slim collapsible `Beaker`-icon pop above the row; result is rendered inside the row, not in a modal.

### Policies (`src/pages/dashboard/Policies.tsx`)
- Two columns on `lg`+: Blocked keywords | Allowed keywords. Each is a chip-input (Enter to add, ⌫ to remove, click to delete) instead of a raw `Textarea` — reads as a real policy editor.
- Block message moves to its own card with a live preview chip showing how the message will render in a blocked log entry.

### Logs (`src/pages/dashboard/Logs.tsx`)
- Already 6-col grid. Add: status filter pills above the grid (instead of the `Select`), a "Live" toggle that polls every 5s with the `live-pulse` indicator, and a JSON view tab in the detail sheet for raw payload.

### Playground (`src/pages/dashboard/Playground.tsx`)
- Already split-pane. Add: persistent prompt history (last 10) in a left `Popover` triggered by `⌘↑`, model badge with latency once a response returns, and a "Send to Logs" link that opens the resulting log entry in the Logs detail sheet.

## 4. Command palette ⌘K (`src/components/command-palette.tsx`, new)

Wire the existing shadcn `command` primitive into a global palette mounted in `DashboardLayout`. Triggers:
- Keyboard: `⌘K` / `Ctrl+K`.
- Topbar: subtle `[⌘K]` chip to the left of the live indicator (not a button — a kbd hint that's clickable).

Commands:
- Navigate: Overview, Keys, Endpoints, Policies, Logs, Playground.
- Create: New API key, New endpoint.
- Search: free-text filters logs across the last 200 entries (calls `list_logs` once on open, debounced).
- Theme: Toggle light / dark (writes `class="light"` on `<html>`).
- Account: Sign out (Clerk).

## 5. Mobile / responsive shell

The 220px sidebar currently never collapses. Below `lg`:
- Sidebar becomes off-canvas, opened by a hamburger in `Topbar`.
- Use shadcn `Sheet` from the left.
- Topbar collapses live indicator to dot-only on `< sm`.
- Page padding drops to `px-4 py-4` below `md`.

## 6. Loading + empty + error consistency

Audit every page so it uses the same primitives:
- **Loading:** `Skeleton` blocks shaped like the final layout (not a single rectangle).
- **Empty:** the new `EmptyState` with the page-appropriate icon + a primary action that opens the relevant create dialog.
- **Error:** a `surface-2` banner with the `AlertTriangle` icon and a Retry button that re-runs the query — replaces the silent failures in several queries today.

## 7. Brand polish

- Add open-graph + meta in `index.html` (current `og:title` is still "Lovable App").
- Favicon: tiny SVG from the new `Logo` mark.
- Add `prefers-reduced-motion` guards on `.scanline` and `.live-pulse` so we don't strobe accessibility users.

---

## Technical notes

**Files created**
- `src/components/command-palette.tsx`
- `src/components/landing/PipelineDiagram.tsx`
- `src/components/landing/CodeTabs.tsx`
- `src/components/landing/NarrativeBlock.tsx`
- `src/components/auth/AuthShowcasePane.tsx`
- `src/components/keyword-chip-input.tsx` (used by Policies)
- `src/components/error-state.tsx`
- `src/components/mobile-sidebar.tsx`

**Files modified**
- `src/pages/Landing.tsx` — full rewrite per §1.
- `src/pages/SignIn.tsx`, `src/pages/SignUp.tsx` — two-pane shell.
- `src/pages/dashboard/DashboardLayout.tsx` — wires command palette, mobile sidebar, hamburger.
- `src/pages/dashboard/{Keys,Endpoints,Policies,Logs,Playground}.tsx` — density + craft per §3.
- `src/components/topbar.tsx` — `⌘K` hint, hamburger slot, light/dark toggle.
- `index.html` — meta, og, favicon link.
- `src/index.css` — `@media (prefers-reduced-motion)` overrides.

**Deliberately out of scope**
- No backend / edge-function changes.
- No auth provider changes.
- E2E `data-testid`s and visible labels preserved so `e2e/01–07-*.spec.ts` continue to pass; the only test touch needed is one new selector for the hamburger, gated to mobile viewport.

**Rollout**
Single PR. After implementation I'll re-run the existing Playwright suite and screenshot the 6 dashboard pages at 1440 and 390 widths to confirm density + responsiveness before handing back.
