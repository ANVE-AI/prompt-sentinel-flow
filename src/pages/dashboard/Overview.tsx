import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ArrowUpRight, Ban, Search, Activity, Loader2, Inbox } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";
import { useDashboardApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonBlock, SkeletonRows } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Range = "7d" | "14d" | "30d" | "90d";
const RANGE_LABELS: Record<Range, string> = { "7d": "7d", "14d": "14d", "30d": "30d", "90d": "90d" };
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };

/**
 * Overview — operator-style: one hero KPI, a chart that takes the whole
 * width, then two compact insight cards (latency + recent traffic).
 * Density-tuned so every pixel carries signal — the old 4-equal-square
 * stat grid is gone.
 */
const Overview = () => {
  const { call } = useDashboardApi();
  const [range, setRange] = useState<Range>("14d");
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["stats", range],
    queryFn: () => call<any>("stats", { query: { range } }),
  });
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["logs", "recent"],
    queryFn: () => call<any>("list_logs", { query: { limit: "6" } }),
  });
  const { data: spike } = useQuery({
    queryKey: ["block_spike_alert"],
    queryFn: () => call<any>("block_spike_alert"),
    refetchInterval: 60_000,
  });
  const { data: tokenSpike } = useQuery({
    queryKey: ["token_spike_alert"],
    queryFn: () => call<any>("token_spike_alert"),
    refetchInterval: 60_000,
  });

  const total = data?.total ?? 0;
  const blocked = data?.blocked ?? 0;
  const blockedPct = total ? ((blocked / total) * 100).toFixed(1) : "0";
  const avgLatency = data?.avg_latency_ms ?? 0;
  const activeKeys = data?.active_keys ?? 0;
  const totalKeys = data?.total_keys ?? 0;
  const tokensIn = data?.tokens_in_total ?? 0;
  const tokensOut = data?.tokens_out_total ?? 0;
  const tokensSaved = data?.tokens_saved_total ?? 0;
  const tokensTotal = tokensIn + tokensOut;
  const fmtTok = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);

  // True only after the first fetch settles — drives empty-state messaging
  // for the selected window without flashing during initial loads or refetches.
  const noData = !isLoading && data ? (data.total ?? 0) === 0 : false;
  const isUpdating = isFetching && !isLoading;

  return (
    <div className="px-4 md:px-6 py-5 space-y-6 max-w-[1200px] mx-auto">
      <PageHeader
        title="Overview"
        description={`Live signal across every AnveGuard key in the last ${RANGE_DAYS[range]} days.`}
        actions={
          <div className="flex items-center gap-2">
            {isUpdating && (
              <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
              </span>
            )}
            <ToggleGroup
              type="single"
              value={range}
              onValueChange={(v) => v && setRange(v as Range)}
              size="sm"
              variant="outline"
            >
              {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
                <ToggleGroupItem key={r} value={r} aria-label={`Last ${RANGE_LABELS[r]}`}>
                  {RANGE_LABELS[r]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        }
      />

      {/* Page-level empty state — shown when the selected range has zero traffic.
          Sits below alerts so spike banners (which use a different baseline window)
          still show. */}
      {noData && (
        <Card className="surface-1 border-border">
          <CardContent className="p-0">
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title={`No data for the last ${RANGE_DAYS[range]} days`}
              description="Nothing has been logged in this window yet. Try a wider range, or send a request through one of your keys to start populating the dashboard."
              action={
                <div className="flex items-center gap-2">
                  {range !== "90d" && (
                    <button
                      onClick={() => setRange("90d")}
                      className="text-meta text-primary hover:underline"
                    >
                      Switch to last 90 days
                    </button>
                  )}
                  <Link to="/dashboard/keys" className="text-meta text-primary hover:underline">
                    Manage keys
                  </Link>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

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

      {(tokenSpike?.spike || (tokenSpike?.severity_score ?? 0) >= 35) && (() => {
        const lvl = (tokenSpike.severity_level ?? "low") as "none" | "low" | "medium" | "high" | "critical";
        const tone =
          lvl === "critical" || lvl === "high" ? "block" :
          lvl === "medium" ? "warn" : "ok";
        const toneClass =
          tone === "block" ? "border-status-block/40 bg-status-block/5" :
          tone === "warn" ? "border-status-warn/40 bg-status-warn/5" :
          "border-border";
        const iconClass =
          tone === "block" ? "text-status-block" :
          tone === "warn" ? "text-status-warn" : "text-muted-foreground";
        const barClass =
          tone === "block" ? "bg-status-block" :
          tone === "warn" ? "bg-status-warn" : "bg-status-ok";
        const score = tokenSpike.severity_score ?? 0;
        return (
        <Card className={`surface-1 ${toneClass}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Activity className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-body font-medium">
                        Token usage anomaly — last {tokenSpike.window_hours}h
                      </div>
                      <Badge status={tone as any}>
                        {lvl} · {score}/100
                      </Badge>
                    </div>
                    <div className="text-meta text-muted-foreground mt-0.5 tabular-nums">
                      in {fmtTok(tokenSpike.tokens_in)} (≈{fmtTok(tokenSpike.baseline_in)} baseline
                      {tokenSpike.ratio_in ? ` · ${tokenSpike.ratio_in}×` : ""}) ·
                      out {fmtTok(tokenSpike.tokens_out)} (≈{fmtTok(tokenSpike.baseline_out)} baseline
                      {tokenSpike.ratio_out ? ` · ${tokenSpike.ratio_out}×` : ""})
                    </div>
                  </div>
                  <Link
                    to="/dashboard/policies"
                    className="text-meta text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    Tune thresholds <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                {/* Severity meter */}
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded bg-surface-2 overflow-hidden">
                    <div className={`h-full ${barClass}`} style={{ width: `${Math.max(2, score)}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-16 text-right">
                    score {score}
                  </span>
                </div>
                {(tokenSpike.top_keys ?? []).filter((k: any) => (k.severity_score ?? 0) >= 10).length > 0 && (
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {tokenSpike.top_keys
                      .filter((k: any) => (k.severity_score ?? 0) >= 10)
                      .map((k: any) => {
                        const kLvl = (k.severity_level ?? "low") as typeof lvl;
                        const kTone =
                          kLvl === "critical" || kLvl === "high" ? "block" :
                          kLvl === "medium" ? "warn" : "ok";
                        return (
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
                            <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                              <span className="text-meta">{fmtTok(k.tokens_in + k.tokens_out)} tok</span>
                              <Badge status={kTone as any}>{kLvl} {k.severity_score}</Badge>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })()}
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
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
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
              <Satellite
                label="Tokens used"
                value={fmtTok(tokensTotal)}
                sub={tokensSaved > 0 ? `~${fmtTok(tokensSaved)} saved by compression` : "compression off"}
                tone="info"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Token usage chart — separate card to keep the requests chart clean. */}
      {!noData && (
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Cost</div>
            <div className="text-h2 font-medium mt-0.5">Token usage</div>
          </div>
          <div className="text-meta text-muted-foreground tabular-nums">
            in {fmtTok(tokensIn)} · out {fmtTok(tokensOut)} · saved ~{fmtTok(tokensSaved)}
          </div>
        </div>
        <CardContent className="pt-2 pb-4">
          <div className="h-48">
            {isLoading ? (
              <div className="h-full grid place-items-center text-meta text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading token usage…
                </span>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.chart ?? []} margin={{ top: 6, right: 12, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="tk-in" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="tk-out" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--status-ok))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--status-ok))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border-strong))", borderRadius: 8, fontSize: 12, padding: "8px 10px" }} />
                <Area type="monotone" dataKey="tokens_in" stroke="hsl(var(--primary))" fill="url(#tk-in)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="tokens_out" stroke="hsl(var(--status-ok))" fill="url(#tk-out)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="tokens_saved" stroke="hsl(var(--muted-foreground))" fill="transparent" strokeDasharray="3 3" strokeWidth={1.25} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
      )}
      {/* Compression impact — saved tokens grouped by per-key compression mode. */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Cost</div>
            <div className="text-h2 font-medium mt-0.5">Compression impact</div>
          </div>
          <Link to="/dashboard/policies" className="text-meta text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
            Tune policy <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {(() => {
          const rows: any[] = data?.compression_breakdown ?? [];
          if (isLoading) {
            return <SkeletonRows rows={3} cols="grid-cols-[1fr_auto_auto_auto]" rowClassName="px-5 py-2.5 h-auto" />;
          }
          if (rows.length === 0) {
            return (
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title={noData
                  ? `No data for the last ${RANGE_DAYS[range]} days`
                  : "No compression data in this range"}
                description={noData
                  ? "Try widening the time range or send a request through one of your keys."
                  : "Requests in this window didn't trigger compression. Enable a mode in Policies to start saving tokens."}
              />
            );
          }
          const maxSaved = Math.max(1, ...rows.map((r) => r.tokens_saved));
          return (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const totalUsed = (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
                const pct = totalUsed + r.tokens_saved
                  ? ((r.tokens_saved / (totalUsed + r.tokens_saved)) * 100).toFixed(1)
                  : "0";
                const bar = Math.round((r.tokens_saved / maxSaved) * 100);
                const label =
                  r.mode === "inherit" ? `Inherit · resolves to ${r.effective}` :
                  r.mode.charAt(0).toUpperCase() + r.mode.slice(1);
                return (
                  <li key={r.mode} className="grid grid-cols-[160px_1fr_auto_auto] gap-3 items-center px-5 py-2.5 hover:bg-surface-2/60 transition-colors">
                    <div className="min-w-0">
                      <div className="text-body font-medium truncate">{label}</div>
                      <div className="text-meta text-muted-foreground tabular-nums">
                        {r.compressed_requests}/{r.requests} req compressed
                      </div>
                    </div>
                    <div className="h-1.5 rounded bg-surface-2 overflow-hidden">
                      <div className="h-full bg-primary/70" style={{ width: `${bar}%` }} />
                    </div>
                    <span className="text-meta tabular-nums text-muted-foreground w-20 text-right">
                      {pct}% saved
                    </span>
                    <span className="text-body tabular-nums w-24 text-right font-medium">
                      {fmtTok(r.tokens_saved)} tok
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </Card>

      {/* Chart */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Traffic</div>
            <div className="text-h2 font-medium mt-0.5">Requests over time</div>
          </div>
          <div className="text-meta text-muted-foreground tabular-nums">last {RANGE_DAYS[range]} days</div>
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

      {/* Top triggered rules — quick view of which policies are catching the most traffic */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Policy</div>
            <div className="text-h2 font-medium mt-0.5">Top triggered rules</div>
          </div>
          <Link
            to="/dashboard/logs?tab=security"
            className="text-meta text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            Security events <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="p-0">
          {isLoading ? (
            <SkeletonRows rows={4} cols="grid-cols-[1fr_auto]" rowClassName="px-5 py-2.5 h-auto" />
          ) : !data?.top_rules || data.top_rules.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-5 w-5" />}
              title="No rules triggered yet"
              description="Once your policies start firing, the most active rules will rank here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.top_rules.map((r: any) => (
                <li key={r.key} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-5 py-2.5 hover:bg-surface-2 transition-colors">
                  <div className="min-w-0">
                    <p className="text-body truncate">{r.rule}</p>
                    <p className="text-meta text-muted-foreground mt-0.5 font-mono">{r.layer}</p>
                  </div>
                  {r.blocks > 0
                    ? <Badge status="block">{r.blocks} blocked</Badge>
                    : <Badge status="warn">flagged</Badge>}
                  <span className="text-meta tabular-nums text-muted-foreground w-12 text-right">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Visibility — surface recent blocked requests with the literal reason
          so operators can build trust in why things were stopped. */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Visibility</div>
            <div className="text-h2 font-medium mt-0.5">Recent blocked requests</div>
          </div>
          <Link
            to="/dashboard/logs?tab=security"
            className="text-meta text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            All blocks <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="p-0">
          {isLoading ? (
            <SkeletonRows rows={4} cols="grid-cols-[1fr_auto]" rowClassName="px-5 py-3 h-auto" />
          ) : !data?.recent_blocks || data.recent_blocks.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-5 w-5" />}
              title="No blocks recently"
              description="When a request is stopped, you'll see what tripped here — rule, layer, and the matched snippet."
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.recent_blocks.map((b: any) => (
                <li key={b.id} className="px-5 py-3 hover:bg-surface-2 transition-colors">
                  <Link to={`/dashboard/logs?tab=security&focus=${b.id}`} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Ban className="h-3.5 w-3.5 text-status-block shrink-0" />
                          <span className="text-body font-medium truncate">{b.reason}</span>
                        </div>
                        {b.prompt_preview && (
                          <p className="text-meta text-muted-foreground truncate font-mono">
                            “{b.prompt_preview}”
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {b.rule && <Badge variant="outline" className="text-[10px]">{b.rule}</Badge>}
                          {b.layer && <Badge variant="outline" className="text-[10px] font-mono">{b.layer}</Badge>}
                          {b.matched && (
                            <Badge variant="outline" className="text-[10px] font-mono max-w-[220px] truncate">
                              matched: {b.matched}
                            </Badge>
                          )}
                          {b.api_key_name && (
                            <span className="text-[10px] text-muted-foreground">
                              · {b.api_key_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-meta text-muted-foreground tabular-nums shrink-0">
                        {new Date(b.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Common block patterns — the literal snippets that policies caught
          most often. Builds intuition about what users are actually sending. */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Visibility</div>
            <div className="text-h2 font-medium mt-0.5">Common block patterns</div>
          </div>
          <span className="text-meta text-muted-foreground inline-flex items-center gap-1">
            <Search className="h-3.5 w-3.5" /> matched snippets
          </span>
        </div>
        <div className="p-0">
          {isLoading ? (
            <SkeletonRows rows={4} cols="grid-cols-[1fr_auto]" rowClassName="px-5 py-2.5 h-auto" />
          ) : !data?.block_patterns || data.block_patterns.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-5 w-5" />}
              title="No matched patterns yet"
              description="Once policies start firing on specific keywords or shapes, they'll be summarized here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.block_patterns.map((p: any, i: number) => (
                <li key={`${p.layer}-${p.pattern}-${i}`} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-5 py-2.5 hover:bg-surface-2 transition-colors">
                  <div className="min-w-0">
                    <p className="text-body font-mono truncate">"{p.pattern}"</p>
                    <p className="text-meta text-muted-foreground mt-0.5">
                      <span className="font-mono">{p.layer}</span>
                      {p.rule && <span> · {p.rule}</span>}
                    </p>
                  </div>
                  <Badge status="block">{p.count}×</Badge>
                  <span className="text-meta tabular-nums text-muted-foreground w-20 text-right">
                    {p.last_at ? new Date(p.last_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
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
