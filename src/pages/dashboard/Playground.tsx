import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, ShieldAlert, ShieldCheck, Terminal, KeyRound, Plug, Plus } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { readProxyResponse } from "@/lib/proxy-response";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

// Selection values are namespaced so a key id and an endpoint id can never
// collide in the same <Select>. `key:<id>` selects an AnveGuard key (can send
// requests). `ep:<id>` selects a configured-but-unbound endpoint (cannot
// send — surfaces a "create a key" CTA instead).
type Selection = { kind: "key"; id: string } | { kind: "endpoint"; id: string } | null;
const encodeSel = (s: Selection): string => (s ? `${s.kind}:${s.id}` : "");
const decodeSel = (v: string): Selection => {
  if (!v) return null;
  const [kind, ...rest] = v.split(":");
  const id = rest.join(":");
  if (!id) return null;
  if (kind === "key") return { kind: "key", id };
  if (kind === "ep") return { kind: "endpoint", id };
  return null;
};

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(url).host; } catch { return url; }
}

/**
 * REPL-style two-pane Playground: request on the left, live response on
 * the right. Now also lists configured endpoints that have no AnveGuard key
 * yet, with an inline CTA to bind one — so users discover that an endpoint
 * alone isn't enough to send proxy traffic.
 */
const Playground = () => {
  const { call } = useDashboardApi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: keysData } = useQuery({ queryKey: ["keys"], queryFn: () => call<any>("list_keys") });
  const { data: endpointsData } = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<any>("list_endpoints"),
  });

  const activeKeys: any[] = (keysData?.keys ?? []).filter((k: any) => k.is_active);
  const ownedEndpoints: any[] = endpointsData?.endpoints ?? [];
  const sharedEndpoints: any[] = endpointsData?.shared_endpoints ?? [];
  const allEndpoints = [...ownedEndpoints, ...sharedEndpoints];

  // Endpoints the user owns that have no active AnveGuard key bound yet.
  // Shared endpoints are excluded — you can't bind a key to someone else's
  // endpoint from this UI.
  const unboundEndpoints = useMemo(() => {
    const boundIds = new Set(
      activeKeys.map((k) => k.endpoint_id).filter((x: any): x is string => !!x),
    );
    return ownedEndpoints.filter((e) => !boundIds.has(e.id));
  }, [activeKeys, ownedEndpoints]);

  const [selection, setSelection] = useState<Selection>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState("Write a haiku about firewalls.");
  const [stream, setStream] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    blocked: boolean;
    text: string;
    reason?: string;
    verdict?: string;
    layers?: any[];
    detectedIntent?: string;
    intentConfidence?: number;
  } | null>(null);

  // Deep-link: /dashboard/playground?key=<id> auto-selects after returning
  // from the New Key flow on the Endpoints/Keys page.
  useEffect(() => {
    const k = searchParams.get("key");
    if (!k) return;
    if (activeKeys.some((x) => x.id === k)) {
      setSelection({ kind: "key", id: k });
      const next = new URLSearchParams(searchParams);
      next.delete("key");
      setSearchParams(next, { replace: true });
    }
  }, [activeKeys, searchParams, setSearchParams]);

  const selectedKey =
    selection?.kind === "key" ? activeKeys.find((k) => k.id === selection.id) : null;
  const selectedEndpoint =
    selection?.kind === "endpoint" ? allEndpoints.find((e) => e.id === selection.id) : null;

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ["models", selectedKey?.id ?? ""],
    queryFn: () =>
      call<{ models: string[]; source: string; warning?: string }>("list_models", {
        body: { api_key_id: selectedKey!.id },
      }),
    enabled: !!selectedKey,
  });
  const availableModels: string[] = modelsData?.models ?? [];

  useEffect(() => {
    if (!selectedKey || availableModels.length === 0) return;
    const def = availableModels.includes(selectedKey.model_default)
      ? selectedKey.model_default
      : availableModels[0];
    setModel(def);
  }, [selectedKey?.id, modelsData]); // eslint-disable-line react-hooks/exhaustive-deps

  const goCreateKeyForEndpoint = (ep: { id: string; name: string }) => {
    const params = new URLSearchParams({
      new: "1",
      endpoint: ep.id,
      name: ep.name,
    });
    navigate(`/dashboard/keys?${params.toString()}`);
  };

  const send = async () => {
    if (selection?.kind !== "key") {
      toast.error("Select an AnveGuard key first.");
      return;
    }
    if (!apiKey.startsWith("ag_live_")) {
      toast.error("Paste an AnveGuard key (starts with ag_live_) — you can only see it once when you create it.");
      return;
    }
    setLoading(true);
    setResult({ blocked: false, text: "" });
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          stream,
          ...(model ? { model } : {}),
        }),
      });

      const parsed = await readProxyResponse(res, {
        onDelta: (_chunk, acc) => {
          setResult((prev) => ({
            blocked: prev?.blocked ?? false,
            text: acc,
            reason: prev?.reason,
            verdict: prev?.verdict,
            layers: prev?.layers,
            detectedIntent: prev?.detectedIntent,
            intentConfidence: prev?.intentConfidence,
          }));
        },
        onVerdict: (v) => {
          setResult((prev) => ({
            blocked: v.blocked,
            text: prev?.text ?? "",
            reason: v.reason ?? prev?.reason,
            verdict: v.verdict ?? prev?.verdict,
            layers: v.layers ?? prev?.layers,
            detectedIntent: v.detectedIntent ?? prev?.detectedIntent,
            intentConfidence: v.intentConfidence ?? prev?.intentConfidence,
          }));
        },
      });

      setResult({
        blocked: parsed.blocked,
        text: parsed.text,
        reason: parsed.reason,
        verdict: parsed.verdict,
        layers: parsed.layers,
        detectedIntent: parsed.detectedIntent,
        intentConfidence: parsed.intentConfidence,
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Label rendering: prefer the bound endpoint name over the raw provider
  // string for custom-endpoint keys, so users see "Perplexity (Sonar)"
  // rather than "custom".
  const renderKeyLabel = (k: any) => {
    const right = k.endpoint_name || (k.provider === "custom" ? hostOf(k.custom_base_url) : k.provider);
    return `${k.name} — ${right}`;
  };

  const sendDisabled = loading || selection?.kind !== "key";

  // Reason the Send button is currently disabled (shown inline next to the
  // button so users don't have to guess why nothing happens on click).
  const sendBlockedReason: string | null = (() => {
    if (loading) return null;
    if (selection?.kind === "endpoint" && selectedEndpoint) {
      return `"${selectedEndpoint.name}" has no AnveGuard API key bound — create one to send requests through this endpoint.`;
    }
    if (!selection) {
      if (activeKeys.length === 0 && unboundEndpoints.length > 0) {
        return "Pick an endpoint above and create an AnveGuard key for it to send requests.";
      }
      return "Pick an AnveGuard key above to send a request.";
    }
    return null;
  })();

  // Show the top-of-page warning whenever the user has at least one endpoint
  // configured without a bound AnveGuard key. Previously this only appeared
  // when the user had zero keys total, which hid the explanation as soon as
  // *any* other key existed (e.g. the default Lovable key).
  const showUnboundEndpointsBanner = unboundEndpoints.length > 0;

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-[1320px] mx-auto">
      <PageHeader
        title="Playground"
        description="Send a prompt through your proxy and watch policy decisions live."
        actions={
          <Button onClick={send} disabled={sendDisabled} size="default">
            <Send className="h-4 w-4" />
            {loading ? "Sending…" : "Send through proxy"}
          </Button>
        }
      />

      {showUnboundEndpointsBanner && (
        <Card className="surface-1 border-status-warn/40 bg-status-warn/5">
          <div className="p-5 flex items-start gap-4">
            <div className="rounded-md bg-status-warn/15 text-status-warn p-2 shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-body font-medium">
                {unboundEndpoints.length} configured endpoint{unboundEndpoints.length === 1 ? "" : "s"} can't be used yet
              </div>
              <div className="text-meta text-muted-foreground mt-1">
                {unboundEndpoints.length === 1 ? (
                  <>
                    <span className="font-medium text-foreground">"{unboundEndpoints[0].name}"</span> has no AnveGuard API key bound to it.
                    An endpoint by itself is just upstream config — the Playground sends requests using an AnveGuard key, so you need to create one bound to this endpoint before it shows up as a sendable option.
                  </>
                ) : (
                  <>
                    These endpoints have no AnveGuard API key bound to them yet.
                    An endpoint by itself is just upstream config — the Playground sends requests using an AnveGuard key, so you need to create one bound to each endpoint before it shows up as a sendable option.
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {unboundEndpoints.slice(0, 3).map((ep) => (
                  <Button
                    key={ep.id}
                    size="sm"
                    onClick={() => goCreateKeyForEndpoint(ep)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Create key for "{ep.name}"
                  </Button>
                ))}
                {unboundEndpoints.length > 3 && (
                  <span className="text-meta text-muted-foreground self-center">
                    +{unboundEndpoints.length - 3} more in the picker below
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Request pane */}
        <Card className="surface-1 border-border">
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Request</div>
            <Badge variant="outline" className="font-mono">POST /v1/chat/completions</Badge>
          </div>
          <CardContent className="p-5 space-y-4">
            {(activeKeys.length > 0 || unboundEndpoints.length > 0) && (
              <div>
                <Label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Key or endpoint
                </Label>
                <Select
                  value={encodeSel(selection)}
                  onValueChange={(v) => {
                    setSelection(decodeSel(v));
                    setModel("");
                  }}
                >
                  <SelectTrigger className="mt-1.5 surface-2 border-border">
                    <SelectValue placeholder="Pick a key or endpoint…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeKeys.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Your AnveGuard keys
                        </SelectLabel>
                        {activeKeys.map((k: any) => (
                          <SelectItem key={`key:${k.id}`} value={`key:${k.id}`}>
                            <span className="flex items-center gap-2">
                              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                              {renderKeyLabel(k)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {unboundEndpoints.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Configured endpoints (no key yet)
                        </SelectLabel>
                    {unboundEndpoints.map((e: any) => (
                          <SelectItem key={`ep:${e.id}`} value={`ep:${e.id}`}>
                            <span className="flex flex-col items-start gap-0.5">
                              <span className="flex items-center gap-2">
                                <Plug className="h-3.5 w-3.5 text-status-warn" />
                                {e.name} — <span className="font-mono text-xs text-muted-foreground">{hostOf(e.base_url)}</span>
                                {e.default_model && (
                                  <span className="text-xs text-muted-foreground">· {e.default_model}</span>
                                )}
                              </span>
                              <span className="text-[11px] text-status-warn pl-5">
                                No AnveGuard key bound — can't send yet
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>

                {selectedEndpoint && (
                  <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-body">
                      <ShieldAlert className="h-4 w-4 mt-0.5 text-status-warn shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">No AnveGuard key bound to this endpoint yet.</div>
                        <div className="text-meta text-muted-foreground mt-0.5">
                          Create one to start sending requests through the proxy. The endpoint config and your upstream provider key will be reused.
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => goCreateKeyForEndpoint(selectedEndpoint)}
                      className="w-full sm:w-auto"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Create AnveGuard key for "{selectedEndpoint.name}"
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="ak" className="text-meta uppercase tracking-wider text-muted-foreground">AnveGuard API key</Label>
              <Input
                id="ak" value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ag_live_…"
                className="mt-1.5 font-mono text-xs surface-2 border-border"
              />
            </div>
            {selectedKey && (
              <div>
                <Label htmlFor="model" className="text-meta uppercase tracking-wider text-muted-foreground">Model</Label>
                <Select value={model} onValueChange={setModel} disabled={modelsLoading || availableModels.length === 0}>
                  <SelectTrigger className="mt-1.5 font-mono text-xs surface-2 border-border">
                    <SelectValue placeholder={modelsLoading ? "Loading models…" : "Pick a model"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {availableModels.map((m) => (
                      <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-meta uppercase tracking-wider text-muted-foreground">Prompt</Label>
              <Textarea
                rows={9} value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mt-1.5 font-mono text-xs surface-2 border-border"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="stream" checked={stream} onCheckedChange={setStream} />
              <Label htmlFor="stream" className="text-body cursor-pointer">Stream tokens</Label>
            </div>
          </CardContent>
        </Card>

        {/* Response pane */}
        <Card className="surface-1 border-border">
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Response</div>
            {result ? (
              result.blocked
                ? <Badge status="block">Blocked by admin policy</Badge>
                : <Badge status="ok">allowed</Badge>
            ) : (
              <Badge status="neutral">idle</Badge>
            )}
          </div>
          <CardContent className="p-5">
            {!result ? (
              <EmptyState
                icon={<Terminal className="h-5 w-5" />}
                title="Output will appear here"
                description="Send a request from the left pane to see streaming output and policy results."
              />
            ) : (
              <div className="space-y-3">
                {result.blocked && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
                    <div className="flex items-start gap-2 text-body text-status-block">
                      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">This request was blocked by your organization's AI policy.</div>
                        {result.reason && <div className="text-meta mt-1 opacity-80">{result.reason}</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      <Badge status="block" className="font-mono">verdict: {result.verdict ?? "block"}</Badge>
                      {result.detectedIntent && (
                        <Badge status="info" className="font-mono">
                          intent: {result.detectedIntent}
                          {typeof result.intentConfidence === "number" &&
                            ` · ${(result.intentConfidence * 100).toFixed(0)}%`}
                        </Badge>
                      )}
                    </div>
                    {Array.isArray(result.layers) && result.layers.filter((l: any) => l.verdict !== "allow").length > 0 && (
                      <div className="pl-6 space-y-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fired layers</div>
                        <div className="space-y-1">
                          {result.layers.filter((l: any) => l.verdict !== "allow").map((l: any, i: number) => (
                            <div key={i} className="rounded border border-border bg-surface-2 px-2.5 py-1.5 text-meta">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[11px] text-foreground">
                                  {l.layer}{l.rule ? ` · ${l.rule}` : ""}
                                </span>
                                <Badge
                                  status={l.verdict === "block" ? "block" : "warn"}
                                  className="font-mono text-[10px]"
                                >
                                  {l.verdict}
                                </Badge>
                              </div>
                              {l.reason && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">{l.reason}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <pre className="rounded-md border border-border bg-surface-2 p-4 text-xs whitespace-pre-wrap font-mono leading-relaxed min-h-[280px]">
                  {result.text || (loading ? "▌" : "")}
                </pre>
                {!result.blocked && result.text && (
                  <div className="flex items-center gap-2 text-meta text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-status-ok" />
                    Passed input + output policies
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Playground;
