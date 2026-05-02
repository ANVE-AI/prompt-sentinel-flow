import { NavLink } from "react-router-dom";
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
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

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

  return (
    <Sidebar collapsible="icon" className="hidden lg:flex border-r border-sidebar-border">
      <SidebarHeader className="h-12 px-3 flex flex-row items-center border-b border-sidebar-border">
        {!collapsed ? (
          <Logo to="/dashboard" />
        ) : (
          <NavLink
            to="/dashboard"
            aria-label="Overview"
            className="mx-auto h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center font-semibold text-[13px]"
          >
            a
          </NavLink>
        )}
      </SidebarHeader>

      <SidebarContent className="py-2">
        {groups.map((g) => (
          <SidebarGroup key={g.id}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
              {g.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <NavLink to={item.to} end={item.end}>
                        {({ isActive }) => (
                          <>
                            <span
                              aria-hidden
                              className={cn(
                                "absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full transition-opacity",
                                isActive ? "opacity-100 bg-primary" : "opacity-0",
                              )}
                            />
                            <item.icon
                              className={cn(
                                "h-[15px] w-[15px] shrink-0",
                                isActive ? "text-primary" : "text-muted-foreground",
                              )}
                            />
                            <span
                              className={cn(
                                "font-medium",
                                isActive ? "text-foreground" : "text-sidebar-foreground/80",
                              )}
                            >
                              {item.label}
                            </span>
                          </>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
