import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";
import { useDashboardApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonBlock, SkeletonRows } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

/**
 * Overview — operator-style: one hero KPI, a chart that takes the whole
 * width, then two compact insight cards (latency + recent traffic).
 * Density-tuned so every pixel carries signal — the old 4-equal-square
 * stat grid is gone.
 */
const Overview = () => {
  const { call } = useDashboardApi();
  const { data, isLoading } = useQuery({ queryKey: ["stats"], queryFn: () => call<any>("stats") });
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["logs", "recent"],
    queryFn: () => call<any>("list_logs", { query: { limit: "6" } }),
  });
  const { data: spike } = useQuery({
    queryKey: ["block_spike_alert"],
    queryFn: () => call<any>("block_spike_alert"),
    refetchInterval: 60_000,
  });

  const total = data?.total ?? 0;
  const blocked = data?.blocked ?? 0;
  const blockedPct = total ? ((blocked / total) * 100).toFixed(1) : "0";
  const avgLatency = data?.avg_latency_ms ?? 0;
  const activeKeys = data?.active_keys ?? 0;
  const totalKeys = data?.total_keys ?? 0;

  return (
    <div className="px-4 md:px-6 py-5 space-y-6 max-w-[1200px] mx-auto">
      <PageHeader
        title="Overview"
        description="Live signal across every AnveGuard key in the last 14 days."
      />

      {spike?.spike && (
        <Card className="surface-1 border-status-block/40 bg-status-block/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-4 w-4 mt-0.5 text-status-block shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-body font-medium">
                      Blocked input spike detected — {spike.last_24h} events in the last 24h
                    </div>
                    <div className="text-meta text-muted-foreground mt-0.5 tabular-nums">
                      {spike.baseline_per_24h > 0
                        ? <>≈{spike.baseline_per_24h}/day baseline · {spike.ratio ? `${spike.ratio}×` : "—"} above normal</>
                        : <>No prior baseline — sudden activity over the last 24 hours</>}
                    </div>
                  </div>
                  <Link
                    to="/dashboard/logs?tab=security"
                    className="text-meta text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    Investigate <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                {(spike.top_keys ?? []).length > 0 && (
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {spike.top_keys.map((k: any) => (
                      <li
                        key={k.api_key_id}
                        className="flex items-center justify-between gap-2 rounded border border-border bg-surface-2 px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="text-meta truncate">{k.api_key_name}</div>
                          {k.api_key_prefix && (
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{k.api_key_prefix}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-meta tabular-nums">{k.blocked_24h}</span>
                          {k.spike && <Badge status="block">spike</Badge>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hero KPI block */}
      {isLoading ? (
        <SkeletonBlock variant="kpi" />
      ) : (
        <Card className="surface-1 border-border shadow-pop overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
              <div className="p-5">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total requests</div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <div className="text-display-lg font-semibold tabular-nums tracking-tight">
                    {total.toLocaleString()}
                  </div>
                  <Badge status="ok">live</Badge>
                </div>
                <div className="mt-1 text-meta text-muted-foreground">14-day rolling window</div>
              </div>
              <Satellite label="Blocked" value={blocked.toLocaleString()} sub={`${blockedPct}% of traffic`} tone="block" />
              <Satellite label="Avg. latency" value={`${avgLatency}ms`} sub="All providers" tone="info" />
              <Satellite label="Active keys" value={`${activeKeys}`} sub={`${totalKeys} total`} tone="ok" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Traffic</div>
            <div className="text-h2 font-medium mt-0.5">Requests over time</div>
          </div>
          <div className="text-meta text-muted-foreground tabular-nums">last 14 days</div>
        </div>
        <CardContent className="pt-2 pb-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.chart ?? []} margin={{ top: 6, right: 12, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--status-block))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--status-block))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border-strong))",
                    borderRadius: 8,
                    fontSize: 12,
                    padding: "8px 10px",
                  }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" fill="url(#g1)" strokeWidth={1.75} />
                <Area type="monotone" dataKey="blocked" stroke="hsl(var(--status-block))" fill="url(#g2)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent requests — same row format used in Logs for consistency */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Stream</div>
            <div className="text-h2 font-medium mt-0.5">Recent requests</div>
          </div>
          <Link
            to="/dashboard/logs"
            className="text-meta text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            Open Logs <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <CardContent className="p-0">
          {logsLoading ? (
            <SkeletonRows
              rows={6}
              cols="grid-cols-[80px_1fr_auto]"
              rowClassName="px-5 py-2.5 h-auto"
            />
          ) : !logsData?.logs || logsData.logs.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-5 w-5" />}
              title="No requests yet"
              description="Issue an AnveGuard key and send your first request through the proxy."
              action={
                <Link
                  to="/dashboard/keys"
                  className="inline-flex items-center gap-1 text-meta text-primary hover:underline"
                >
                  Create a key <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {logsData.logs.map((log: any) => {
                const prompt = (log.messages?.[log.messages.length - 1]?.content ?? "").toString();
                const status =
                  log.status === "allowed" ? "ok" :
                  log.status === "error"   ? "warn" : "block";
                return (
                  <li key={log.id} className="grid grid-cols-[80px_1fr_auto] gap-3 items-center px-5 py-2.5 hover:bg-surface-2 transition-colors">
                    <span className="text-meta text-muted-foreground tabular-nums">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <div className="min-w-0">
                      <p className="text-body truncate">{prompt || "—"}</p>
                      <p className="text-meta text-muted-foreground mt-0.5 font-mono">
                        {log.api_key_name} · {log.model}
                      </p>
                    </div>
                    <Badge status={status as any}>{log.status}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Satellite = ({
  label, value, sub,
}: { label: string; value: string; sub: string; tone: "ok" | "warn" | "block" | "info" }) => (
  <div className="p-5">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-1 text-display font-semibold tabular-nums tracking-tight">{value}</div>
    <div className="mt-1 text-meta text-muted-foreground">{sub}</div>
  </div>
);

export default Overview;
