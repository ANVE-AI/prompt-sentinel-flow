import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  KeyRound,
  ShieldCheck,
  ScrollText,
  Terminal,
  Plug,
  Server,
  GitBranch,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { MobileSidebar } from "@/components/mobile-sidebar";
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
    items: [{ to: "/dashboard/playground", label: "Playground", icon: Terminal }],
  },
];

const DashboardLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex w-[220px] shrink-0 border-r border-border bg-sidebar flex-col">
        <div className="h-12 px-4 flex items-center border-b border-sidebar-border">
          <Logo to="/dashboard" />
        </div>

        <nav className="flex-1 px-2 py-4 space-y-5 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="px-2 mb-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "relative flex items-center gap-2.5 rounded-md pl-3 pr-2 h-8 text-body transition-colors",
                        isActive
                          ? "text-foreground bg-sidebar-accent"
                          : "text-sidebar-foreground/80 hover:text-foreground hover:bg-sidebar-accent/60",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden
                          className={cn(
                            "absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full transition-opacity",
                            isActive ? "opacity-100 bg-primary" : "opacity-0",
                          )}
                        />
                        <item.icon className={cn("h-[15px] w-[15px]", isActive ? "text-primary" : "text-muted-foreground")} />
                        <span className="font-medium">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="rounded-md border border-border surface-2 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</div>
            <div className="text-meta text-foreground mt-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-status-ok shadow-[0_0_0_3px_hsl(var(--status-ok)/0.18)]" />
              All systems operational
            </div>
          </div>
        </div>
      </aside>

      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
      <CommandPalette />

      <main className="flex-1 min-w-0 flex flex-col">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
