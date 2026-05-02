import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, ShieldAlert, ShieldCheck } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

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

  // Reset model when key changes; default to the key's model_default
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

      // Streaming SSE
      if (!res.ok || !res.body) {
        const txt = await res.text();
        setResult({ blocked: false, text: txt });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let blocked = false;
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
            if (obj?.anveguard?.blocked) {
              blocked = true;
              reason = obj.anveguard.reason;
            }
            if (obj?.choices?.[0]?.finish_reason === "content_filter") {
              blocked = true;
            }
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
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="text-muted-foreground text-sm mt-1">Send a prompt through your proxy and see policy results live.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Request</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {activeKeys.length > 0 && (
            <div>
              <Label className="text-xs">AnveGuard key (for model list)</Label>
              <Select value={keyId} onValueChange={(v) => { setKeyId(v); setModel(""); }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a key…" /></SelectTrigger>
                <SelectContent>
                  {activeKeys.map((k: any) => (
                    <SelectItem key={k.id} value={k.id}>{k.name} — {k.provider}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="ak">AnveGuard API key</Label>
            <Input id="ak" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="ag_live_…" className="mt-1.5 font-mono text-sm" />
            <p className="text-xs text-muted-foreground mt-1">Paste here — keys aren't stored client-side.</p>
          </div>
          {keyId && (
            <div>
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel} disabled={modelsLoading || availableModels.length === 0}>
                <SelectTrigger className="mt-1.5 font-mono text-sm">
                  <SelectValue placeholder={modelsLoading ? "Loading models…" : "Pick a model"} />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {availableModels.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {modelsData?.warning && (
                <p className="text-xs text-muted-foreground mt-1">⚠ {modelsData.warning} — showing fallback list.</p>
              )}
              {modelsData?.source === "live" && (
                <p className="text-xs text-muted-foreground mt-1">{availableModels.length} models from upstream</p>
              )}
            </div>
          )}
          <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="font-mono text-sm" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch id="stream" checked={stream} onCheckedChange={setStream} />
              <Label htmlFor="stream" className="text-sm cursor-pointer">Stream tokens</Label>
            </div>
            <Button onClick={send} disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Sending…" : "Send through proxy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className={result.blocked ? "border-destructive/40" : undefined}>
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              Response
              {result.blocked ? (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                  <ShieldAlert className="h-3 w-3 mr-1" /> Blocked by admin policy
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">
                  <ShieldCheck className="h-3 w-3 mr-1" /> allowed
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.blocked && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">This request was blocked by your organization's AI policy.</div>
                  {result.reason && <div className="text-xs mt-1 opacity-80">{result.reason}</div>}
                </div>
              </div>
            )}
            <pre className="rounded-md border border-border bg-muted/40 p-4 text-sm whitespace-pre-wrap">{result.text}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Playground;
