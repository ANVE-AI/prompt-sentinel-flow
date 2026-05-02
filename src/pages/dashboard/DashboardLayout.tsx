import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, KeyRound, ShieldCheck, ScrollText, Terminal, LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/keys", label: "API Keys", icon: KeyRound },
  { to: "/dashboard/policies", label: "Policies", icon: ShieldCheck },
  { to: "/dashboard/logs", label: "Logs", icon: ScrollText },
  { to: "/dashboard/playground", label: "Playground", icon: Terminal },
];

const DashboardLayout = () => {
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-16 px-5 flex items-center border-b border-sidebar-border">
          <Logo to="/dashboard" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="rounded-md p-3 bg-sidebar-accent/40">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="text-sm font-medium truncate">demo@anveguard.dev</div>
            <Button variant="ghost" size="sm" className="w-full justify-start mt-2 -ml-2 h-8">
              <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
