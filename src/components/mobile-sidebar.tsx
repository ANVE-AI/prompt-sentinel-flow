import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  KeyRound,
  ShieldCheck,
  ScrollText,
  Terminal,
  Plug,
  Menu,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };

const groups: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/dashboard/keys", label: "API Keys", icon: KeyRound },
      { to: "/dashboard/endpoints", label: "Endpoints", icon: Plug },
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

/**
 * Mobile off-canvas sidebar. Triggered by the hamburger in the Topbar.
 * Auto-closes on route change so the user lands on the new page without
 * an extra tap.
 */
export const MobileSidebar = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const { pathname } = useLocation();
  useEffect(() => { onOpenChange(false); /* eslint-disable-next-line */ }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[260px] p-0 border-border bg-sidebar">
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
                        "relative flex items-center gap-2.5 rounded-md pl-3 pr-2 h-9 text-body transition-colors",
                        isActive
                          ? "text-foreground bg-sidebar-accent"
                          : "text-sidebar-foreground/80 hover:text-foreground hover:bg-sidebar-accent/60",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span aria-hidden className={cn("absolute left-0 top-2 bottom-2 w-[2px] rounded-r-full", isActive ? "bg-primary" : "opacity-0")} />
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
      </SheetContent>
    </Sheet>
  );
};

export const HamburgerButton = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="lg:hidden inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
    aria-label="Open navigation"
  >
    <Menu className="h-4 w-4" />
  </button>
);
