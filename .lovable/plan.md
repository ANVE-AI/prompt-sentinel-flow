## Goal
Make the active route in the desktop sidebar visually unmistakable, and ensure every item shows a tooltip with its label when the sidebar is collapsed to the icon rail.

## Current state (`src/components/dashboard-sidebar.tsx`)
- Active state today = a 2px left accent bar + primary-colored icon + slightly brighter label text. The row background does **not** change, so on a busy page the active item barely stands out — especially in the collapsed icon rail where the label is hidden.
- `SidebarMenuButton` is already passed `tooltip={item.label}`. shadcn's sidebar shows that tooltip only when `state === "collapsed"` and not on mobile, which is what we want, but the tooltip currently inherits default placement. We'll pass a structured tooltip prop so it consistently renders to the right with proper alignment.

## Changes (single file: `src/components/dashboard-sidebar.tsx`)

1. **Stronger active highlight on the row itself**
   - Add `bg-sidebar-accent text-sidebar-accent-foreground font-medium` to the `NavLink` when `isActive`, via the `className` render-prop. This paints the entire row (works in both expanded and collapsed states, so the active icon tile is clearly filled in the icon rail too).
   - Keep the existing left primary accent bar and primary-tinted icon for the secondary cue.
   - Add `transition-colors` to the icon for a smoother hover/active feel.
   - Remove the redundant `font-medium` from the label span (now applied at the row level only when active, so inactive rows look lighter).

2. **Reliable collapsed tooltips**
   - Replace `tooltip={item.label}` with `tooltip={{ children: item.label, side: "right", align: "center" }}` on every `SidebarMenuButton`. shadcn already auto-hides the tooltip when the sidebar is expanded or on mobile, so no extra logic is needed.

3. **Header "a" tile (collapsed Logo replacement)**
   - Add `aria-current` styling parity: when on `/dashboard`, give the tile a faint ring so it matches the new active-row treatment. (Optional polish — small `ring-1 ring-primary/30` when `useMatch("/dashboard")`.)

No other files touched. No new dependencies. Tokens used (`sidebar-accent`, `sidebar-accent-foreground`, `primary`, `muted-foreground`) already exist in the design system.

## Out of scope
- Mobile sheet sidebar (`MobileSidebar`) — separate component, can be a follow-up if desired.
- Group-label active state (parents don't currently have routes).
