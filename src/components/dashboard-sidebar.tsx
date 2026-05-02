import { useMemo, useState, type KeyboardEvent } from "react";
import { NavLink, useMatch } from "react-router-dom";
import {
  LayoutDashboard,
  KeyRound,
  ShieldCheck,
  ScrollText,
  Terminal,
  Plug,
  Server,
  GitBranch,
  FlaskConical,
  ShieldQuestion,
  Search,
  X,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { COMMAND_PALETTE_EVENT } from "@/components/command-palette";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };

const groups: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/dashboard/keys", label: "API Keys", icon: KeyRound },
      { to: "/dashboard/providers", label: "Providers", icon: Server },
      { to: "/dashboard/endpoints", label: "Endpoints", icon: Plug },
      { to: "/dashboard/routes", label: "Routes", icon: GitBranch },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { to: "/dashboard/policies", label: "Policies", icon: ShieldCheck },
      { to: "/dashboard/logs", label: "Logs", icon: ScrollText },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [
      { to: "/dashboard/playground", label: "Playground", icon: Terminal },
      { to: "/dashboard/policies/sandbox", label: "Policy sandbox", icon: FlaskConical },
      { to: "/dashboard/policies/harness", label: "Policy harness", icon: ShieldQuestion },
    ],
  },
];

/**
 * Desktop sidebar (lg+) backed by shadcn's collapsible Sidebar.
 * `collapsible="icon"` keeps a 3rem icon rail visible when collapsed
 * so the user can re-expand from the SidebarTrigger in the topbar.
 */
export function DashboardSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const overviewActive = !!useMatch({ path: "/dashboard", end: true });

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const openPalette = () => window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));

  const filteredItems = useMemo(() => {
    if (!q) return null;
    const all = groups.flatMap((g) => g.items);
    return all.filter(
      (i) => i.label.toLowerCase().includes(q) || i.to.toLowerCase().includes(q),
    );
  }, [q]);

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Enter" && filteredItems && filteredItems.length === 0) {
      e.preventDefault();
      openPalette();
    }
  };

  return (
    <Sidebar collapsible="icon" className="hidden lg:flex border-r border-sidebar-border">
      <SidebarHeader className="h-12 px-3 flex flex-row items-center border-b border-sidebar-border">
        {!collapsed ? (
          <Logo to="/dashboard" />
        ) : (
          <NavLink
            to="/dashboard"
            aria-label="Overview"
            className={cn(
              "mx-auto h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center font-semibold text-[13px] transition-shadow",
              overviewActive && "ring-1 ring-primary/40",
            )}
          >
            a
          </NavLink>
        )}
      </SidebarHeader>

      <SidebarContent className="py-2">
        {/* Search */}
        <SidebarGroup className="pb-1">
          <SidebarGroupContent>
            {collapsed ? (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={openPalette}
                    tooltip={{ children: "Search (⌘K)", side: "right", align: "center" }}
                    aria-label="Search"
                  >
                    <Search className="h-[15px] w-[15px] text-muted-foreground" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            ) : (
              <div role="search" className="relative px-1">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Find a page…"
                  aria-label="Find a dashboard page"
                  aria-keyshortcuts="Meta+K Control+K"
                  className="h-8 pl-7 pr-12 text-sm bg-sidebar-accent/40 border-sidebar-border focus-visible:bg-background"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openPalette}
                    aria-label="Open command palette"
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 rounded border border-sidebar-border bg-background/60 px-1 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    ⌘K
                  </button>
                )}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {filteredItems ? (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
              Pages
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {filteredItems.length === 0 ? (
                <button
                  type="button"
                  onClick={openPalette}
                  className="w-full text-left px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  No pages match. Press Enter to search everything →
                </button>
              ) : (
                <SidebarMenu>
                  {filteredItems.map((item) => (
                    <NavItemRow key={item.to} item={item} />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          groups.map((g) => (
            <SidebarGroup key={g.id}>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                {g.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((item) => (
                    <NavItemRow key={item.to} item={item} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="p-3 border-t border-sidebar-border">
          <div className="rounded-md border border-border surface-2 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</div>
            <div className="text-meta text-foreground mt-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-status-ok shadow-[0_0_0_3px_hsl(var(--status-ok)/0.18)]" />
              All systems operational
            </div>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

function NavItemRow({ item }: { item: NavItem }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={{ children: item.label, side: "right", align: "center" }}
      >
        <NavLink
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "relative",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1 bottom-1 w-[2px] rounded-r-full transition-opacity",
                  isActive ? "opacity-100 bg-primary" : "opacity-0",
                )}
              />
              <item.icon
                className={cn(
                  "h-[15px] w-[15px] shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className={cn(isActive ? "text-foreground" : "text-sidebar-foreground/80")}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
