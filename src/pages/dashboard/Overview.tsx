import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ShieldAlert, KeyRound, Gauge } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { useDashboardApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const Stat = ({ icon: Icon, label, value, sub }: any) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold mt-1 tracking-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const Overview = () => {
  const { call } = useDashboardApi();
  const { data, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => call<any>("stats"),
  });
  const { data: logsData } = useQuery({
    queryKey: ["logs", "recent"],
    queryFn: () => call<any>("list_logs", { query: { limit: "5" } }),
  });

  const total = data?.total ?? 0;
  const blocked = data?.blocked ?? 0;
  const blockedPct = total ? ((blocked / total) * 100).toFixed(1) : "0";

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Last 14 days of activity across your AnveGuard keys.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={Activity} label="Total requests" value={total.toLocaleString()} sub="14d window" />
          <Stat icon={ShieldAlert} label="Blocked" value={blocked} sub={`${blockedPct}% of traffic`} />
          <Stat icon={KeyRound} label="Active keys" value={data?.active_keys ?? 0} sub={`${data?.total_keys ?? 0} total`} />
          <Stat icon={Gauge} label="Avg. latency" value={`${data?.avg_latency_ms ?? 0}ms`} sub="All providers" />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Requests over time</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.chart ?? []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" fill="url(#g1)" strokeWidth={2} />
                <Area type="monotone" dataKey="blocked" stroke="hsl(var(--destructive))" fill="url(#g2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Recent requests</CardTitle></CardHeader>
        <CardContent>
          {(!logsData?.logs || logsData.logs.length === 0) ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No requests yet. Create a key and send your first prompt through the proxy.</p>
          ) : (
            <div className="space-y-2">
              {logsData.logs.map((log: any) => {
                const prompt = (log.messages?.[log.messages.length - 1]?.content ?? "").toString().slice(0, 100);
                return (
                  <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{prompt || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{log.api_key_name} · {log.model}</p>
                    </div>
                    <span className={`ml-4 text-xs px-2 py-1 rounded-md ${
                      log.status === "allowed" ? "bg-success/10 text-success"
                      : log.status === "error" ? "bg-warning/10 text-warning"
                      : "bg-destructive/10 text-destructive"}`}>{log.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Overview;
