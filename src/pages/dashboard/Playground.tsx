import { useState } from "react";
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
  const [prompt, setPrompt] = useState("Write a haiku about firewalls.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ blocked: boolean; text: string; reason?: string } | null>(null);

  const send = async () => {
    if (!apiKey.startsWith("ag_live_")) {
      toast.error("Paste an AnveGuard key (starts with ag_live_) — you can only see it once when you create it.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const blocked = !!data?.anveguard?.blocked;
      const text = data?.choices?.[0]?.message?.content ?? data?.error?.message ?? JSON.stringify(data);
      setResult({ blocked, text, reason: data?.anveguard?.reason });
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
              <Label className="text-xs">Reference (your active keys)</Label>
              <Select value={keyId} onValueChange={setKeyId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a key for reference…" /></SelectTrigger>
                <SelectContent>
                  {activeKeys.map((k: any) => (
                    <SelectItem key={k.id} value={k.id}>{k.name} — {k.model_default}</SelectItem>
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
          <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="font-mono text-sm" />
          <div className="flex justify-end">
            <Button onClick={send} disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Sending…" : "Send through proxy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              Response
              {result.blocked ? (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                  <ShieldAlert className="h-3 w-3 mr-1" /> blocked
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">
                  <ShieldCheck className="h-3 w-3 mr-1" /> allowed
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.reason && <div className="text-xs text-destructive">{result.reason}</div>}
            <pre className="rounded-md border border-border bg-muted/40 p-4 text-sm whitespace-pre-wrap">{result.text}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Playground;
