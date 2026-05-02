import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, ShieldAlert, ShieldCheck, Terminal } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

/**
 * REPL-style two-pane Playground: request on the left, live response on
 * the right. Keeps the user's eye on both while streaming. On narrow
 * viewports it stacks gracefully.
 */
const Playground = () => {
  const { call } = useDashboardApi();
  const { data: keysData } = useQuery({ queryKey: ["keys"], queryFn: () => call<any>("list_keys") });
  const activeKeys = (keysData?.keys ?? []).filter((k: any) => k.is_active);

  const [keyId, setKeyId] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState("Write a haiku about firewalls.");
  const [stream, setStream] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ blocked: boolean; text: string; reason?: string } | null>(null);

  const selectedKey = activeKeys.find((k: any) => k.id === keyId);

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ["models", keyId],
    queryFn: () => call<{ models: string[]; source: string; warning?: string }>("list_models", { body: { api_key_id: keyId } }),
    enabled: !!keyId,
  });
  const availableModels: string[] = modelsData?.models ?? [];

  useEffect(() => {
    if (!selectedKey || availableModels.length === 0) return;
    const def = availableModels.includes(selectedKey.model_default)
      ? selectedKey.model_default : availableModels[0];
    setModel(def);
  }, [keyId, modelsData]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
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

      if (!stream) {
        const data = await res.json();
        const blocked = !!data?.anveguard?.blocked;
        const text = data?.choices?.[0]?.message?.content ?? data?.error?.message ?? JSON.stringify(data);
        setResult({ blocked, text, reason: data?.anveguard?.reason });
        return;
      }

      if (!res.ok || !res.body) {
        const txt = await res.text();
        setResult({ blocked: false, text: txt });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", acc = "", blocked = false;
      let reason: string | undefined;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            const delta = obj?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
              acc += delta;
              setResult({ blocked, text: acc, reason });
            }
            if (obj?.anveguard?.blocked) { blocked = true; reason = obj.anveguard.reason; }
            if (obj?.choices?.[0]?.finish_reason === "content_filter") blocked = true;
          } catch { /* partial */ }
        }
      }
      setResult({ blocked, text: acc, reason });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-6 py-5 space-y-5 max-w-[1320px] mx-auto">
      <PageHeader
        title="Playground"
        description="Send a prompt through your proxy and watch policy decisions live."
        actions={
          <Button onClick={send} disabled={loading} size="default">
            <Send className="h-4 w-4" />
            {loading ? "Sending…" : "Send through proxy"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Request pane */}
        <Card className="surface-1 border-border">
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Request</div>
            <Badge variant="outline" className="font-mono">POST /v1/chat/completions</Badge>
          </div>
          <CardContent className="p-5 space-y-4">
            {activeKeys.length > 0 && (
              <div>
                <Label className="text-meta uppercase tracking-wider text-muted-foreground">Key (for model list)</Label>
                <Select value={keyId} onValueChange={(v) => { setKeyId(v); setModel(""); }}>
                  <SelectTrigger className="mt-1.5 surface-2 border-border"><SelectValue placeholder="Pick a key…" /></SelectTrigger>
                  <SelectContent>
                    {activeKeys.map((k: any) => (
                      <SelectItem key={k.id} value={k.id}>{k.name} — {k.provider}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            {keyId && (
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
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-body text-status-block flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium">This request was blocked by your organization's AI policy.</div>
                      {result.reason && <div className="text-meta mt-1 opacity-80">{result.reason}</div>}
                    </div>
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
