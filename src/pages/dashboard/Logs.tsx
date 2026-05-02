import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, ShieldAlert, Ban, ShieldCheck, Inbox, Layers, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { KeyValue } from "@/components/key-value";
import { EmptyState } from "@/components/empty-state";

const statusOf = (s: string): "ok" | "warn" | "block" =>
  s === "allowed" ? "ok" : s === "error" ? "warn" : "block";

const auditActionMeta: Record<string, { label: string; icon: typeof Ban }> = {
  "api_key.revoked": { label: "API key revoked", icon: Ban },
};

// Shared 6-column grid template so the Requests + Audit tabs visually align.
const requestsCols = "grid-cols-[150px_minmax(0,1fr)_140px_82px_104px_92px]";
const auditCols = "grid-cols-[160px_220px_minmax(0,1fr)_160px]";

const STATUS_PILLS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "allowed", label: "Allowed" },
  { id: "blocked_input", label: "Blocked (input)" },
  { id: "blocked_output", label: "Blocked (output)" },
  { id: "error", label: "Error" },
];

const RequestLogs = () => {
  const { call } = useDashboardApi();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<any>(null);
  const [live, setLive] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["logs", status],
    queryFn: () => call<any>("list_logs", { query: { status, limit: "200" } }),
    refetchInterval: live ? 5_000 : false,
  });

  // Deep-link: when the global ⌘K palette navigates here with `?focus=<id>`,
  // auto-open that log's detail sheet once the data has loaded, then strip
  // the param so a refresh doesn't re-trigger it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focusId = searchParams.get("focus");
    if (!focusId || !data?.logs) return;
    const hit = data.logs.find((l: any) => l.id === focusId);
    if (hit) {
      setSelected(hit);
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  }, [data, searchParams, setSearchParams]);

  const filtered = (data?.logs ?? []).filter((l: any) => {
    if (!q) return true;
    return JSON.stringify(l.messages ?? "").toLowerCase().includes(q.toLowerCase());
  });

  const promptOf = (l: any) =>
    (l.messages?.[l.messages.length - 1]?.content ?? "").toString();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-9 surface-2 border-border"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-0.5">
          {STATUS_PILLS.map((p) => (
            <button
              key={p.id}
              onClick={() => setStatus(p.id)}
              className={`h-7 px-2.5 text-meta rounded transition-colors ${
                status === p.id
                  ? "bg-surface-1 text-foreground shadow-pop"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setLive((v) => !v)}
          className={`inline-flex items-center gap-2 h-9 px-3 rounded-md border text-meta transition-colors ${
            live
              ? "border-status-ok/40 bg-status-ok/10 text-foreground"
              : "border-border surface-2 text-muted-foreground hover:text-foreground"
          }`}
          title="Auto-refresh every 5s"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-status-ok live-pulse" : "bg-muted-foreground"}`} />
          {live ? (isFetching ? "Live · syncing" : "Live") : "Live"}
        </button>
      </div>


      <Card className="surface-1 border-border overflow-hidden">
        {/* Mobile: horizontal scroll preserves dense column layout. */}
        <div className="overflow-x-auto">
        <div className="min-w-[760px]">
        <div className={`grid ${requestsCols} gap-3 px-4 h-9 items-center border-b border-border bg-surface-2/60 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.1em]`}>
          <div>Time</div><div>Prompt</div><div>Key</div><div className="text-right">Latency</div><div className="text-right">Tokens</div><div>Status</div>
        </div>
        {isLoading ? (
          <SkeletonRows rows={8} cols={requestsCols} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="No requests match your filters"
            description="Try a wider time range or clear the prompt search."
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((l: any) => {
              const isBlocked = l.status?.startsWith("blocked");
              return (
                <li key={l.id}>
                  <button
                    onClick={() => setSelected(l)}
                    className={`w-full grid ${requestsCols} gap-3 px-4 h-9 items-center text-left transition-colors hover:bg-surface-2`}
                  >
                    <span className="text-meta text-muted-foreground font-mono tabular-nums">
                      {new Date(l.created_at).toLocaleString()}
                    </span>
                    <span className="text-body truncate flex items-center gap-2 min-w-0">
                      {isBlocked && <ShieldAlert className="h-3.5 w-3.5 text-status-block shrink-0" />}
                      <span className="truncate">{promptOf(l) || "—"}</span>
                    </span>
                    <span className="text-meta text-muted-foreground font-mono truncate">{l.api_key_name}</span>
                    <span className="text-meta tabular-nums text-right">{l.latency_ms ?? 0}ms</span>
                    <span className="text-meta tabular-nums text-right text-muted-foreground">
                      {l.tokens_in ?? "—"}/{l.tokens_out ?? "—"}
                    </span>
                    <Badge status={statusOf(l.status)}>{l.status}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  Request detail
                  <Badge status={statusOf(selected.status)}>{selected.status}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-body">
                <div className="grid grid-cols-2 gap-4">
                  <KeyValue label="Time" mono={false}>{new Date(selected.created_at).toLocaleString()}</KeyValue>
                  <KeyValue label="Latency">{selected.latency_ms ?? 0}ms</KeyValue>
                  <KeyValue label="Provider" mono={false}>{selected.provider}</KeyValue>
                  <KeyValue label="Model">{selected.model}</KeyValue>
                  <KeyValue label="Tokens in">{selected.tokens_in ?? "—"}</KeyValue>
                  <KeyValue label="Tokens out">{selected.tokens_out ?? "—"}</KeyValue>
                </div>
                {selected.block_reason && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-status-block text-meta">
                    {selected.block_reason}
                  </div>
                )}
                <PolicyVerdictPanel log={selected} />
                <Tabs defaultValue="pretty">
                  <TabsList className="bg-surface-2 border border-border h-8 p-0.5">
                    <TabsTrigger value="pretty" className="h-7 px-2.5 text-meta data-[state=active]:bg-surface-1">Pretty</TabsTrigger>
                    <TabsTrigger value="raw" className="h-7 px-2.5 text-meta data-[state=active]:bg-surface-1">Raw JSON</TabsTrigger>
                  </TabsList>
                  <TabsContent value="pretty" className="space-y-3 mt-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Messages</div>
                      <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(selected.messages, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Response</div>
                      <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(selected.response, null, 2)}
                      </pre>
                    </div>
                  </TabsContent>
                  <TabsContent value="raw" className="mt-3">
                    <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(selected, null, 2)}
                    </pre>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

// ---- Per-request policy verdict panel ------------------------------------
// Surfaces the per-layer breakdown the proxy persisted in `verdict_layers`
// (especially behavioral signals: instruction_churn, roleplay_escalation,
// encoding_escalation, length_spike) so an operator can understand WHY a
// given conversation was flagged or blocked without diving into raw JSON.

type LayerEntry = {
  layer: string;
  verdict: string;
  rule?: string | null;
  reason?: string | null;
  intent?: string | null;
  confidence?: number | null;
  matched?: string | null;
};

const VERDICT_TONE: Record<string, string> = {
  block: "border-destructive/40 text-destructive bg-destructive/10",
  sanitize: "border-amber-500/40 text-amber-500 bg-amber-500/10",
  flag: "border-amber-500/40 text-amber-500 bg-amber-500/10",
  allow: "border-emerald-500/40 text-emerald-500 bg-emerald-500/10",
  throttled: "border-destructive/40 text-destructive bg-destructive/10",
};

const LAYER_LABELS: Record<string, string> = {
  keywords: "Keywords",
  patterns: "Pattern rules",
  heuristics: "Heuristics",
  intent: "Intent classifier",
  injection: "Injection guard",
  behavioral: "Behavioral",
};

function PolicyVerdictPanel({ log }: { log: any }) {
  const verdict: string | null = log.verdict ?? null;
  const rawLayers = Array.isArray(log.verdict_layers) ? log.verdict_layers : [];
  const layers: LayerEntry[] = rawLayers.map((l: any) => ({
    layer: String(l?.layer ?? "unknown"),
    verdict: String(l?.verdict ?? "allow"),
    rule: l?.rule ?? null,
    reason: l?.reason ?? null,
    intent: l?.intent ?? null,
    confidence: typeof l?.confidence === "number" ? l.confidence : null,
    matched: l?.matched ?? null,
  }));
  const fired = layers.filter((l) => l.verdict !== "allow");
  const behavioral = fired.filter((l) => l.layer === "behavioral");

  // Nothing meaningful to show — skip the panel entirely.
  if (!verdict && fired.length === 0 && !log.detected_intent) return null;

  const Icon =
    verdict === "allow" ? ShieldCheck :
    verdict === "flag" ? AlertTriangle :
    ShieldAlert;

  return (
    <div className="rounded-md border border-border surface-2 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4",
            verdict === "allow" && "text-emerald-500",
            verdict === "flag" && "text-amber-500",
            (verdict === "block" || verdict === "sanitize" || !verdict) && "text-destructive",
          )} />
          <span className="text-meta font-medium">Policy verdict</span>
          {verdict && (
            <Badge variant="outline" className={cn("font-mono text-[10px]", VERDICT_TONE[verdict] ?? "")}>
              {verdict}
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Layers className="h-3 w-3" /> {fired.length} fired / {layers.length} ran
        </span>
      </div>

      {log.detected_intent && (
        <div className="rounded border border-border bg-surface-1 p-2 text-meta flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Detected intent:</span>
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{log.detected_intent}</code>
          </div>
          {typeof log.intent_confidence === "number" && (
            <span className="text-[11px] text-muted-foreground">
              conf {Math.round(log.intent_confidence * 100)}%
            </span>
          )}
        </div>
      )}

      {behavioral.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Behavioral signals
          </div>
          {behavioral.map((l, i) => (
            <LayerRow key={`b-${i}`} entry={l} />
          ))}
        </div>
      )}

      {fired.filter((l) => l.layer !== "behavioral").length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Other layers
          </div>
          {fired.filter((l) => l.layer !== "behavioral").map((l, i) => (
            <LayerRow key={`o-${i}`} entry={l} />
          ))}
        </div>
      )}

      {fired.length === 0 && (
        <div className="text-meta text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> All layers allowed this request.
        </div>
      )}
    </div>
  );
}

function LayerRow({ entry: l }: { entry: LayerEntry }) {
  const label = LAYER_LABELS[l.layer] ?? l.layer;
  return (
    <div className="rounded border border-border bg-surface-1 p-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-meta font-medium">{label}</span>
          {l.rule && (
            <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground truncate">
              {l.rule}
            </code>
          )}
          {l.intent && (
            <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              {l.intent}
            </code>
          )}
        </div>
        <Badge variant="outline" className={cn("font-mono text-[10px]", VERDICT_TONE[l.verdict] ?? "")}>
          {l.verdict}
        </Badge>
      </div>
      {l.reason && <div className="text-meta text-muted-foreground">{l.reason}</div>}
      {l.confidence != null && (
        <div className="text-[11px] text-muted-foreground">
          confidence {Math.round(l.confidence * 100)}%
        </div>
      )}
    </div>
  );
}


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
      <div className="flex gap-2">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-56 h-9 surface-2 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="api_key.revoked">API key revoked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="surface-1 border-border overflow-hidden">
        <div className="overflow-x-auto">
        <div className="min-w-[720px]">
        <div className={`grid ${auditCols} gap-3 px-4 h-9 items-center border-b border-border bg-surface-2/60 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.1em]`}>
          <div>Time</div><div>Action</div><div>Target</div><div>Actor</div>
        </div>
        {isLoading ? (
          <SkeletonRows rows={6} cols={auditCols} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="No audit entries yet"
            description="Account-level actions like key revocations will appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e: any) => {
              const meta = auditActionMeta[e.action] ?? { label: e.action, icon: ShieldCheck };
              const Icon = meta.icon;
              const target = e.metadata?.key_name
                ? `${e.metadata.key_name} (${e.metadata.key_prefix ?? "—"}…)`
                : e.target_id ?? "—";
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setSelected(e)}
                    className={`w-full grid ${auditCols} gap-3 px-4 h-9 items-center text-left transition-colors hover:bg-surface-2`}
                  >
                    <span className="text-meta text-muted-foreground font-mono tabular-nums">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                    <Badge status="info" className="w-fit">
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                    <span className="text-body truncate">{target}</span>
                    <span className="text-meta text-muted-foreground truncate font-mono">{e.actor_user_id}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader><SheetTitle>Audit entry</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-5 text-body">
                <div className="grid grid-cols-2 gap-4">
                  <KeyValue label="Time" mono={false}>{new Date(selected.created_at).toLocaleString()}</KeyValue>
                  <KeyValue label="Action">{selected.action}</KeyValue>
                  <KeyValue label="Target type" mono={false}>{selected.target_type}</KeyValue>
                  <KeyValue label="Target id">{selected.target_id ?? "—"}</KeyValue>
                  <KeyValue label="Actor" className="col-span-2">{selected.actor_user_id}</KeyValue>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Metadata</div>
                  <pre className="rounded-md border border-border bg-surface-2 p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

const Logs = () => (
  <div className="px-4 md:px-6 py-5 space-y-5 max-w-[1320px] mx-auto">
    <PageHeader
      title="Logs"
      description="Request traffic and account-level audit events."
    />

    <Tabs defaultValue="requests" className="space-y-4">
      <TabsList className="bg-surface-2 border border-border h-9 p-0.5">
        <TabsTrigger value="requests" className="h-8 px-3 text-body data-[state=active]:bg-surface-1 data-[state=active]:shadow-pop">
          Requests
        </TabsTrigger>
        <TabsTrigger value="audit" className="h-8 px-3 text-body data-[state=active]:bg-surface-1 data-[state=active]:shadow-pop">
          Audit log
        </TabsTrigger>
      </TabsList>
      <TabsContent value="requests" className="space-y-4 animate-fade-in">
        <RequestLogs />
      </TabsContent>
      <TabsContent value="audit" className="space-y-4 animate-fade-in">
        <AuditLog />
      </TabsContent>
    </Tabs>
  </div>
);

export default Logs;
