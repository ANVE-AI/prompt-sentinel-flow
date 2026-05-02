import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShieldAlert } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const statusStyle: Record<string, string> = {
  allowed: "bg-success/10 text-success border-success/30",
  blocked_input: "bg-destructive/10 text-destructive border-destructive/30",
  blocked_output: "bg-destructive/10 text-destructive border-destructive/30",
  error: "bg-warning/10 text-warning border-warning/30",
};

const Logs = () => {
  const { call } = useDashboardApi();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["logs", status],
    queryFn: () => call<any>("list_logs", { query: { status, limit: "200" } }),
  });

  const filtered = (data?.logs ?? []).filter((l: any) => {
    if (!q) return true;
    const text = JSON.stringify(l.messages ?? "").toLowerCase();
    return text.includes(q.toLowerCase());
  });

  const promptOf = (l: any) =>
    (l.messages?.[l.messages.length - 1]?.content ?? "").toString();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Every request that passed through AnveGuard.</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search prompts…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="allowed">Allowed</SelectItem>
            <SelectItem value="blocked_input">Blocked (input)</SelectItem>
            <SelectItem value="blocked_output">Blocked (output)</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="grid grid-cols-[180px_1fr_140px_100px_120px_110px] gap-4 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <div>Time</div><div>Prompt</div><div>Key</div><div>Latency</div><div>Tokens</div><div>Status</div>
        </div>
        {isLoading ? <Skeleton className="h-48 m-4" /> : (
          <div className="divide-y divide-border">
            {filtered.map((l: any) => {
              const isBlocked = l.status?.startsWith("blocked");
              return (
                <button key={l.id} onClick={() => setSelected(l)}
                  className={`w-full grid grid-cols-[180px_1fr_140px_100px_120px_110px] gap-4 px-4 py-3 text-left text-sm transition-colors items-center border-l-2 ${
                    isBlocked
                      ? "bg-destructive/5 hover:bg-destructive/10 border-destructive"
                      : "border-transparent hover:bg-muted/40"
                  }`}>
                  <div className="text-muted-foreground text-xs">{new Date(l.created_at).toLocaleString()}</div>
                  <div className="truncate flex items-center gap-2">
                    {isBlocked && <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0" />}
                    <span className="truncate">{promptOf(l)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{l.api_key_name}</div>
                  <div className="text-xs">{l.latency_ms ?? 0}ms</div>
                  <div className="text-xs text-muted-foreground">{l.tokens_in ?? "—"}/{l.tokens_out ?? "—"}</div>
                  <div><Badge variant="outline" className={`text-[10px] ${statusStyle[l.status]}`}>{l.status}</Badge></div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">No requests match your filters.</div>
            )}
          </div>
        )}
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Request detail
                  <Badge variant="outline" className={`text-[10px] ${statusStyle[selected.status]}`}>{selected.status}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div><div className="text-xs text-muted-foreground">Time</div><div>{new Date(selected.created_at).toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted-foreground">Latency</div><div>{selected.latency_ms ?? 0}ms</div></div>
                  <div><div className="text-xs text-muted-foreground">Provider</div><div>{selected.provider}</div></div>
                  <div><div className="text-xs text-muted-foreground">Model</div><div className="font-mono text-xs">{selected.model}</div></div>
                  <div><div className="text-xs text-muted-foreground">Tokens in</div><div>{selected.tokens_in ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Tokens out</div><div>{selected.tokens_out ?? "—"}</div></div>
                </div>
                {selected.block_reason && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">{selected.block_reason}</div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Messages</div>
                  <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap overflow-x-auto">{JSON.stringify(selected.messages, null, 2)}</pre>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Response</div>
                  <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap overflow-x-auto">{JSON.stringify(selected.response, null, 2)}</pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Logs;
