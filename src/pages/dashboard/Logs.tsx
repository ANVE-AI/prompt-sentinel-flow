import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, ShieldAlert, Ban, ShieldCheck } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const statusStyle: Record<string, string> = {
  allowed: "bg-success/10 text-success border-success/30",
  blocked_input: "bg-destructive/10 text-destructive border-destructive/30",
  blocked_output: "bg-destructive/10 text-destructive border-destructive/30",
  error: "bg-warning/10 text-warning border-warning/30",
};

// Map of audit action -> short human label + icon. Centralized so we can add
// new tracked actions (e.g. key.created, endpoint.deleted) without touching
// the row renderer.
const auditActionMeta: Record<string, { label: string; icon: typeof Ban; tone: string }> = {
  "api_key.revoked": {
    label: "API key revoked",
    icon: Ban,
    tone: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const RequestLogs = () => {
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
    <>
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
    </>
  );
};

// Audit log view: shows account-level actions (revocations etc.).
// Reads from the server-only `audit_logs` table via the dashboard function.
const AuditLog = () => {
  const { call } = useDashboardApi();
  const [action, setAction] = useState<string>("all");
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit_logs", action],
    queryFn: () => call<any>("list_audit_logs", { query: { action, limit: "200" } }),
  });

  const entries = data?.entries ?? [];

  return (
    <>
      <div className="flex gap-3">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="api_key.revoked">API key revoked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="grid grid-cols-[180px_220px_1fr_140px] gap-4 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <div>Time</div><div>Action</div><div>Target</div><div>Actor</div>
        </div>
        {isLoading ? <Skeleton className="h-48 m-4" /> : (
          <div className="divide-y divide-border">
            {entries.map((e: any) => {
              const meta = auditActionMeta[e.action] ?? {
                label: e.action,
                icon: ShieldCheck,
                tone: "bg-muted/40 text-muted-foreground border-border",
              };
              const Icon = meta.icon;
              const targetLabel = e.metadata?.key_name
                ? `${e.metadata.key_name} (${e.metadata.key_prefix ?? "—"}…)`
                : e.target_id ?? "—";
              return (
                <button key={e.id} onClick={() => setSelected(e)}
                  className="w-full grid grid-cols-[180px_220px_1fr_140px] gap-4 px-4 py-3 text-left text-sm transition-colors items-center hover:bg-muted/40">
                  <div className="text-muted-foreground text-xs">{new Date(e.created_at).toLocaleString()}</div>
                  <div>
                    <Badge variant="outline" className={`text-[10px] gap-1 ${meta.tone}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  </div>
                  <div className="truncate text-sm">{targetLabel}</div>
                  <div className="text-xs text-muted-foreground truncate font-mono">{e.actor_user_id}</div>
                </button>
              );
            })}
            {entries.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">No audit entries yet.</div>
            )}
          </div>
        )}
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Audit entry</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div><div className="text-xs text-muted-foreground">Time</div><div>{new Date(selected.created_at).toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted-foreground">Action</div><div className="font-mono text-xs">{selected.action}</div></div>
                  <div><div className="text-xs text-muted-foreground">Target type</div><div>{selected.target_type}</div></div>
                  <div><div className="text-xs text-muted-foreground">Target id</div><div className="font-mono text-xs break-all">{selected.target_id ?? "—"}</div></div>
                  <div className="col-span-2"><div className="text-xs text-muted-foreground">Actor</div><div className="font-mono text-xs break-all">{selected.actor_user_id}</div></div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Metadata</div>
                  <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

const Logs = () => {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Request traffic and account-level audit events.</p>
      </div>

      <Tabs defaultValue="requests" className="space-y-6">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="space-y-6">
          <RequestLogs />
        </TabsContent>
        <TabsContent value="audit" className="space-y-6">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Logs;
