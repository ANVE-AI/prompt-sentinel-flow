import { useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UserButton } from "@clerk/clerk-react";
import { ChevronRight } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { StatusDot } from "@/components/ui/status-dot";

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
 * Left:   "anveguard / <Section>" breadcrumb (consistent location anchor).
 * Right:  Live request indicator + UserButton.
 *
 * The live indicator polls the existing `stats` action (already cached for
 * Overview) and shows a pulsing dot + "n / 14d" reading. It's the smallest
 * possible "the firewall is watching" cue and makes every page feel alive.
 */
export const Topbar = () => {
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

  return (
    <header className="sticky top-0 z-30 h-12 flex items-center justify-between gap-4 px-4 border-b border-border bg-background/85 backdrop-blur">
      <nav className="flex items-center gap-2 text-body min-w-0">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          anveguard
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        <span className="font-medium truncate">{section}</span>
      </nav>

      <div className="flex items-center gap-4">
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
        <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
      </div>
    </header>
  );
};
