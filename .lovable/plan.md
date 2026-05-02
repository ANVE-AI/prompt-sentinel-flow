
# UI/UX Revamp — AnveGuard

## Audit of the current UI

The product looks generic because it relies on default shadcn defaults compounded by common AI-generated patterns:

- **Palette is the "AI green + blue gradient" cliché** — primary `158 84% 52%` to accent `195 90% 55%` with hero radial glow and `text-gradient` on every CTA.
- **Typography is system-default Inter-ish** — same `tracking-tight` headings, same weights, no display face, no rhythm.
- **Layout is shadcn-stock** — left sidebar 256px, page header `text-2xl font-semibold`, four equal stat cards, one chart, table-of-rows. Identical to ~70% of dashboards shipped this year.
- **Density is wasteful** — `p-8` page padding + `pt-6` cards + `mb-6` gaps make every page feel like a marketing site, not an operator console for security data.
- **Logo is a Lucide `Shield` in a gradient square** — instantly recognizable as Lovable boilerplate.
- **Landing page** uses the canonical "macOS code window + 6 feature cards + 5 numbered steps + CTA" formula.
- **Visual language has no signature** — no instrumentation cues (no monospace data, no live indicators, no diff/log treatments) despite the product being literally a request-inspection tool.

## Design direction

Position AnveGuard as an **operator's console** — closer to Datadog, Linear, Stripe Workbench, and Tailscale than to a marketing SaaS. Three principles:

1. **Calm by default, loud on signal.** Neutral surfaces; color reserved for status (allowed / blocked / error), never for decoration.
2. **Data is the design.** Monospace for keys, IDs, models; tabular numerals; aligned columns; stable row heights.
3. **A single signature element**: a thin **scanline / status rail** running along the left edge of the active page that pulses on live request activity — visually unique and reinforces the "firewall watching traffic" mental model.

## Design system changes

### Color tokens (`src/index.css`)

Replace the green/cyan cliché with a **two-temperature** system: warm-neutral surfaces, electric-violet primary used sparingly, status colors carved out for semantics only.

```text
Dark (default):
  background        222 18% 5%       (deeper, less blue)
  surface-1 (card)  224 16% 8%
  surface-2 (raised)226 14% 11%
  border-subtle     224 12% 14%
  border-strong     224 12% 20%
  foreground        210 20% 96%
  muted-foreground  220 10% 62%

  primary           255 85% 66%      (electric indigo — distinctive, not green)
  primary-soft      255 85% 66% / .12
  primary-foreground 222 18% 5%

  accent (rarely)   188 90% 60%      (cyan, used only for links / focus rings)

  status-ok         152 60% 48%
  status-warn       38 92% 58%
  status-block      350 80% 62%      (rose, not pure red — less alarming chrome)
  status-info       210 90% 65%

Light:
  background        220 25% 99%
  surface-1         0 0% 100%
  surface-2         220 20% 97%
  border-subtle     220 15% 92%
  foreground        222 30% 12%
  primary           255 75% 56%
```

Remove `--gradient-primary`, `--gradient-hero`, `--shadow-glow`, `--text-gradient`, `--bg-hero`. Replace with:

- `--shadow-pop` — single subtle elevation `0 1px 0 hsl(var(--border-strong)), 0 8px 24px -12px hsl(0 0% 0% / .4)`
- `--rail-active` — the signature scanline gradient.

### Typography

- **Display / headings:** Geist or Inter with `font-feature-settings: "ss01","cv11","tnum"` and **tighter tracking only on display sizes** (≥28px). Body stays at default tracking.
- **Mono:** Geist Mono (or JetBrains Mono fallback) with `tnum` enabled — used for keys, IDs, latencies, model names, log timestamps.
- New scale: `display-lg 40/44`, `display 28/32`, `h1 20/28`, `h2 16/22`, `body 14/20`, `meta 12/16`, `mono 12/18`.
- Drop `text-gradient`. Headlines are flat foreground; the **only** gradient in the entire app is the left-edge status rail.

### Logo

Replace the Lucide Shield with a custom inline SVG: a square, rotated 45°, with a thin diagonal "scanline" passing through it — reads as "guard" + "inspect". Two-color: outline + single accent stroke. Animates the scanline subtly on hover. Distinct, no longer recognizable as boilerplate.

### Spacing & density

- Page padding `p-8 → px-6 py-5` on dashboard, with a sticky page-header bar.
- Cards: `rounded-lg` (10px), `border-subtle`, no inner shadow, `p-4` not `p-6`.
- Tables: 36px row height, monospace for IDs/timestamps, hover row inset using `surface-2`.

### Components

- **Button** — add a `variant="primary"` that's flat indigo (no gradient). Keep `outline` and `ghost`. Remove `shadow-glow`.
- **Badge** — new `status` variant set: `ok | warn | block | info | neutral` with a 6px leading dot, not a full chip background. Cleaner in dense logs.
- **StatusDot** (new) — 8px dot with `box-shadow: 0 0 0 3px hsl(... / .15)`; pulses when live.
- **DataRow** (new) — standardized log-row primitive: time · prompt · key · status, with monospace columns and aligned widths.
- **KeyValue** (new) — small label/value pair for detail sheets, replaces ad-hoc `<div className="text-xs text-muted-foreground">…</div>` patterns.
- **EmptyState** (new) — illustrated empty for "no logs yet", "no endpoints", etc., with one primary action.

## Page-by-page changes

### Landing (`src/pages/Landing.tsx`)
Replace the trope stack with:
- A **single full-bleed hero** with a static "request flow" diagram on the right: `your-app → ▢ AnveGuard → ▢ provider`, with one row animating a request flowing through it.
- Remove the macOS code window. Replace with a tabbed snippet (Python / Node / curl) in a flat bordered surface — no traffic-light dots.
- Replace the 6-feature grid with **3 vertical narrative sections** (Inspect, Enforce, Audit), each with a real product screenshot crop on the right.
- Replace "How it works" 5-step row with a thin horizontal **pipeline diagram** rendered in SVG — the same scanline motif from the logo.
- Footer: minimal, single-row.

### Dashboard shell (`DashboardLayout.tsx`)
- **Sidebar 220px**, no `text-sm` waste; nav items 32px tall with leading icons in `muted-foreground`, active = primary text + 2px left rail.
- **Top bar** added: breadcrumbs left, `⌘K` command palette trigger center, environment switcher + user button right.
- Sidebar groups: `Workspace` (Overview, Keys, Endpoints) / `Governance` (Policies, Logs) / `Tools` (Playground).
- Persistent **live indicator** in top bar: green pulsing dot + "n requests/min" reading from `stats`.

### Overview (`Overview.tsx`)
- Replace 4 equal stat cards with a **hero KPI block**: total requests as `display-lg`, blocked count and avg latency as smaller satellites — single row, less square-grid feel.
- Chart becomes a **stacked area** with a granularity toggle (1h / 24h / 7d / 14d) and a brushed selection.
- Recent requests becomes the new `DataRow` primitive — same row format used in Logs (consistency).
- Add a **"Top blocked terms" minicard** and a **"Slowest models" minicard** — gives the page real signal density beyond defaults.

### Keys, Endpoints, Policies, Logs, Playground
- Adopt the new `DataRow`, `Badge status`, `KeyValue`, `EmptyState` primitives — replaces ad-hoc styling already present.
- Logs: column widths fixed via CSS grid template tokens so audit + requests tabs align identically.
- Endpoints usage dialog: switch from full-screen feel to a right-anchored sheet at 640px with section dividers, mirrors Logs detail sheet for muscle memory.
- Playground: split-pane layout (request left, response right) instead of stacked cards — feels like a real REPL.

### Auth pages (`SignIn.tsx`, `SignUp.tsx`)
- Two-pane layout: form left (480px), product imagery / live log preview right. Removes the "Clerk widget centered on a marketing background" look.

## Technical implementation

### Files touched
- `src/index.css` — full token rewrite + utilities for `bg-grid-fade`, `rail-active`, monospace tabular numerals.
- `tailwind.config.ts` — extend `fontFamily` (sans/mono), `fontSize` scale, `boxShadow.pop`, `borderRadius` recalibration.
- `src/components/Logo.tsx` — replace with custom inline SVG.
- `src/components/ui/badge.tsx` — add `status` variant.
- `src/components/ui/button.tsx` — drop gradient default, add flat primary.
- New primitives: `src/components/ui/status-dot.tsx`, `src/components/data-row.tsx`, `src/components/key-value.tsx`, `src/components/empty-state.tsx`, `src/components/page-header.tsx`, `src/components/topbar.tsx`.
- `src/pages/Landing.tsx` — full rewrite per direction above.
- `src/pages/dashboard/DashboardLayout.tsx` — sidebar restructure + topbar.
- `src/pages/dashboard/Overview.tsx` — KPI hero + new chart treatment + minicards.
- `src/pages/dashboard/{Keys,Endpoints,Policies,Logs,Playground}.tsx` — adopt new primitives, density pass, fix `p-8 → px-6 py-5`, replace inline status pills with `Badge status`.
- `src/pages/{SignIn,SignUp}.tsx` — two-pane layout.
- `index.html` — preconnect + `@font-face` for Geist / Geist Mono via fontsource (added as devDep).

### Dependencies
- Add `geist` (font package) for Geist Sans + Mono. Loaded once in `main.tsx`.

### Out of scope (to keep diff reviewable)
- E2E selectors won't change — text labels, ARIA roles, and data-testids are preserved so the Playwright suite (`e2e/*.spec.ts`) still passes.
- No backend / edge-function changes.
- No copy rewrites beyond landing-page narrative blocks.

## Rollout
Single PR. Visual regressions caught by re-running the existing E2E suite after; navigation + audit-log + create-key-journey tests exercise every page.

## Out-of-the-box differentiators (summary)
1. Custom logo + signature scanline motif used in topbar, page rail, and landing pipeline.
2. Indigo (not green) primary, status-only color, mono-everywhere for data.
3. Hero KPI overview instead of a 4-card grid.
4. Split-pane Playground.
5. Two-pane auth pages.
6. Sticky topbar with `⌘K` and live req/min indicator.

