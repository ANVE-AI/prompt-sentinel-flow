import { useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@clerk/clerk-react";
import { ChevronRight, Search } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { StatusDot } from "@/components/ui/status-dot";
import { COMMAND_PALETTE_EVENT } from "@/components/command-palette";
import { HamburgerButton } from "@/components/mobile-sidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";

const labelByPath: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/keys": "API Keys",
  "/dashboard/providers": "Providers",
  "/dashboard/endpoints": "Endpoints",
  "/dashboard/routes": "Routes",
  "/dashboard/policies": "Policies",
  "/dashboard/policies/sandbox": "Policy sandbox",
  "/dashboard/policies/harness": "Policy harness",
  "/dashboard/threats": "Threats",
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
  // Live threat status (24h window) drives the topbar pill — color reflects
  // current operational state at a glance, like Stripe/Linear/Vanta do.
  const { data: attack } = useQuery<{
    total_requests: number; blocked_count: number; flagged_count: number;
  }>({
    queryKey: ["attack_overview", "topbar"],
    queryFn: () => call("attack_overview", { query: { range: "24h" } }),
    refetchInterval: 60_000,
    staleTime: 50_000,
  });
  const total = data?.total ?? 0;
  const section = labelByPath[pathname] ?? "Dashboard";

  const threatTone: "ok" | "warn" | "block" =
    (attack?.blocked_count ?? 0) > 0 ? "block" :
    (attack?.flagged_count ?? 0) > 0 ? "warn" : "ok";
  const threatLabel =
    (attack?.blocked_count ?? 0) > 0 ? `${attack!.blocked_count} blocked` :
    (attack?.flagged_count ?? 0) > 0 ? `${attack!.flagged_count} flagged` :
    "All clear";
  const threatTooltip =
    (attack?.blocked_count ?? 0) > 0
      ? `${attack!.blocked_count} blocked, ${attack!.flagged_count} flagged in last 24h — open Threats`
      : (attack?.flagged_count ?? 0) > 0
        ? `${attack!.flagged_count} flagged (no blocks) in last 24h — open Threats`
        : "No blocks or flags in the last 24 hours — open Threats";

  const openPalette = () => window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30 h-12 flex items-center justify-between gap-3 px-3 sm:px-4 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex items-center gap-2 min-w-0">
        <HamburgerButton onClick={onMenuClick} />
        <SidebarTrigger className="hidden lg:inline-flex h-8 w-8 text-muted-foreground hover:text-foreground" />
        <nav className="flex items-center gap-2 text-body min-w-0">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
            anveguard
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 hidden sm:inline" />
          <span className="font-medium truncate">{section}</span>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile: icon-only trigger so users can still open the ⌘K palette
            without a hardware keyboard. md+: full hint chip. */}
        <button
          onClick={openPalette}
          className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
          aria-label="Open command palette"
          title="Search"
        >
          <Search className="h-4 w-4" />
        </button>
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
        {/* Threat status pill — single most-important live signal in the
            UI. Click → /dashboard/threats. Colour reflects last-24h state. */}
        <Link
          to="/dashboard/threats"
          className="hidden sm:flex items-center gap-2 px-2.5 h-7 rounded-md border border-border bg-surface-2 hover:border-border-strong transition-colors"
          title={threatTooltip}
          aria-label={threatTooltip}
        >
          <StatusDot status={threatTone} live={threatTone !== "ok"} />
          <span className="text-meta tabular-nums">
            <span className="text-foreground font-medium">{threatLabel}</span>
            <span className="ml-1 text-muted-foreground">· 24h</span>
          </span>
        </Link>
        {/* Mobile: dot only, still clickable. */}
        <Link to="/dashboard/threats" className="sm:hidden inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-2" aria-label={threatTooltip} title={threatTooltip}>
          <StatusDot status={threatTone} live={threatTone !== "ok"} />
        </Link>
        {/* Secondary: total request count over the chart range, rendered
            small + de-emphasised. Goes away on small screens. */}
        <span className="hidden md:inline-flex items-center text-meta tabular-nums text-muted-foreground" title="Total requests in the last 14 days">
          {total.toLocaleString()} req
        </span>
        <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
      </div>
    </header>
  );
};
