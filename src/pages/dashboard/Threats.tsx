import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Ban, Flag, Activity, AlertTriangle } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid,
} from "recharts";

type Range = "24h" | "7d" | "30d";

interface AttackOverview {
  range: string;
  range_hours: number;
  total_requests: number;
  allowed_count: number;
  blocked_count: number;
  flagged_count: number;
  block_rate_pct: number;
  top_block_reasons: { reason: string; count: number }[];
  layer_breakdown: { layer: string; blocks: number; flags: number }[];
  hourly: { hour: string; total: number; blocked: number; flagged: number }[];
}

const fmtHour = (iso: string) => {
  const d = new Date(iso);
  return d.getHours().toString().padStart(2, "0") + ":00";
};

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function Threats() {
  const { call } = useDashboardApi();
  const [range, setRange] = useState<Range>("24h");

  const { data, isLoading, error } = useQuery({
    queryKey: ["attack_overview", range],
    queryFn: () => call<AttackOverview>("attack_overview", { query: { range } }),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Threats"
        description="Live view of what the policy engine is catching across your workspace."
        actions={
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {error && (
        <Card className="border-destructive p-4 text-sm text-destructive">
          Failed to load attack overview: {(error as Error).message}
        </Card>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Total requests"
          value={data?.total_requests}
          loading={isLoading}
          icon={Activity}
          tone="muted"
        />
        <Kpi
          label="Blocked"
          value={data?.blocked_count}
          loading={isLoading}
          icon={Ban}
          tone="block"
        />
        <Kpi
          label="Flagged"
          value={data?.flagged_count}
          loading={isLoading}
          icon={Flag}
          tone="warn"
        />
        <Kpi
          label="Block rate"
          value={data?.block_rate_pct}
          suffix="%"
          loading={isLoading}
          icon={ShieldAlert}
          tone={data && data.block_rate_pct > 5 ? "block" : "muted"}
        />
      </div>

      {/* Hourly time-series */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Activity over the {range === "24h" ? "last 24 hours" : range === "7d" ? "last 7 days" : "last 30 days"}
          </h3>
          {data && (
            <span className="text-meta text-muted-foreground">
              {data.allowed_count.toLocaleString()} allowed · {data.flagged_count.toLocaleString()} flagged · {data.blocked_count.toLocaleString()} blocked
            </span>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.hourly.every((h) => h.total === 0) ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="No traffic in this window"
            description="As soon as the proxy starts logging requests, you'll see hourly activity here."
          />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.hourly}>
              <defs>
                <linearGradient id="allowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="threats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="hour"
                tickFormatter={range === "24h" ? fmtHour : fmtDay}
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                labelFormatter={(v) => new Date(v as string).toLocaleString()}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#allowed)" name="Total" />
              <Area type="monotone" dataKey="blocked" stroke="hsl(var(--destructive))" fill="url(#threats)" name="Blocked" />
              <Area type="monotone" dataKey="flagged" stroke="hsl(var(--warning, 38 92% 50%))" fill="transparent" name="Flagged" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Layer breakdown */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Detector layer breakdown</h3>
          <p className="mb-3 text-meta text-muted-foreground">
            Which engine layer caught each verdict. Higher bars = more contribution.
          </p>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !data || data.layer_breakdown.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-5 w-5" />}
              title="No detector hits yet"
              description="The engine hasn't fired on any request in this window."
            />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.layer_breakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="layer" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="blocks" stackId="a" fill="hsl(var(--destructive))" name="Blocks" />
                <Bar dataKey="flags" stackId="a" fill="hsl(38 92% 50%)" name="Flags" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top reasons */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Top block reasons</h3>
          <p className="mb-3 text-meta text-muted-foreground">
            The most common reasons the engine blocked a request. Useful to spot
            recurring attack themes or noisy false positives.
          </p>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !data || data.top_block_reasons.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="No blocks in this window"
              description="Either traffic is clean, or no requests came through."
            />
          ) : (
            <ul className="space-y-2">
              {data.top_block_reasons.map((r) => (
                <li key={r.reason} className="flex items-start justify-between gap-3 rounded border border-border bg-surface-2 px-3 py-2">
                  <span className="line-clamp-2 text-sm" title={r.reason}>{r.reason}</span>
                  <Badge variant="outline" className="shrink-0 tabular-nums">{r.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label, value, loading, icon: Icon, tone, suffix,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  icon: typeof Activity;
  tone: "muted" | "warn" | "block";
  suffix?: string;
}) {
  const toneClass =
    tone === "block" ? "text-destructive" :
    tone === "warn"  ? "text-amber-500" :
                       "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-meta text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${toneClass}`} aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {value === undefined ? "—" : value.toLocaleString()}{suffix ?? ""}
        </div>
      )}
    </Card>
  );
}
