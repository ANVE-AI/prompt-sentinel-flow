import { useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@clerk/clerk-react";
import { ChevronRight, Search } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { StatusDot } from "@/components/ui/status-dot";
import { COMMAND_PALETTE_EVENT } from "@/components/command-palette";
import { HamburgerButton } from "@/components/mobile-sidebar";

const labelByPath: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/keys": "API Keys",
  "/dashboard/endpoints": "Endpoints",
  "/dashboard/policies": "Policies",
  "/dashboard/logs": "Logs",
  "/dashboard/playground": "Playground",
};

/**
 * Sticky top bar.
 *
 * Left:   hamburger (mobile) + "anveguard / <Section>" breadcrumb.
 * Right:  ⌘K hint chip (also clickable), live request indicator, UserButton.
 */
export const Topbar = ({ onMenuClick }: { onMenuClick: () => void }) => {
  const { pathname } = useLocation();
  const { call } = useDashboardApi();
  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: () => call<any>("stats"),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
  const total = data?.total ?? 0;
  const section = labelByPath[pathname] ?? "Dashboard";

  const openPalette = () => window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30 h-12 flex items-center justify-between gap-3 px-3 sm:px-4 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex items-center gap-2 min-w-0">
        <HamburgerButton onClick={onMenuClick} />
        <nav className="flex items-center gap-2 text-body min-w-0">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
            anveguard
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 hidden sm:inline" />
          <span className="font-medium truncate">{section}</span>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={openPalette}
          className="hidden md:inline-flex items-center gap-2 px-2.5 h-7 rounded-md border border-border bg-surface-2 text-meta text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
          title="Open command palette"
        >
          Search…
          <kbd className="font-mono text-[10px] px-1 py-0.5 rounded border border-border bg-background text-muted-foreground">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
        <div
          className="hidden sm:flex items-center gap-2 px-2.5 h-7 rounded-md border border-border bg-surface-2"
          title="Total requests in the last 14 days"
        >
          <StatusDot status="ok" live />
          <span className="text-meta tabular-nums text-muted-foreground">
            <span className="text-foreground font-medium">{total.toLocaleString()}</span>
            <span className="ml-1">req · 14d</span>
          </span>
        </div>
        <div className="sm:hidden">
          <StatusDot status="ok" live />
        </div>
        <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
      </div>
    </header>
  );
};
