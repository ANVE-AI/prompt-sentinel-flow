import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, Trash2, Check, X, Plug, Beaker, Loader2 } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

interface ProviderDef {
  id: string; label: string; managed?: boolean;
  default_model: string; model_suggestions: string[];
  key_placeholder: string; get_key_url: string;
}
interface CustomSchema {
  kinds: { id: string; label: string }[];
  auth_schemes: { id: string; label: string }[];
  templates: {
    id: string; label: string;
    values: {
      kind: string; base_url: string; auth_scheme: string;
      auth_header?: string; default_model: string; model_suggestions: string;
    };
  }[];
}

interface CustomState {
  template: string;
  kind: string;
  base_url: string;
  models_url: string;
  auth_scheme: string;
  auth_header: string;
  model_suggestions: string;
  extra_headers: { key: string; value: string }[];
}

const emptyCustom: CustomState = {
  template: "",
  kind: "openai_compatible",
  base_url: "",
  models_url: "",
  auth_scheme: "bearer",
  auth_header: "Authorization",
  model_suggestions: "",
  extra_headers: [],
};

const Keys = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["keys"], queryFn: () => call<any>("list_keys") });
  const { data: provData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => call<{ providers: ProviderDef[]; custom_schema: CustomSchema }>("list_providers"),
  });
  const providers = provData?.providers ?? [];
  const customSchema = provData?.custom_schema;

  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState<string>("lovable");
  const [model, setModel] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [custom, setCustom] = useState<CustomState>(emptyCustom);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const selected = providers.find((p) => p.id === providerId);
  const isCustom = providerId === "custom";

  const onProviderChange = (id: string) => {
    setProviderId(id);
    const def = providers.find((p) => p.id === id);
    setModel(def?.default_model ?? "");
    setProviderKey("");
    setCustom(emptyCustom);
    setTestResult(null);
  };

  const applyTemplate = (templateId: string) => {
    const t = customSchema?.templates.find((x) => x.id === templateId);
    if (!t) return;
    setCustom((c) => ({
      ...c,
      template: templateId,
      kind: t.values.kind,
      base_url: t.values.base_url,
      auth_scheme: t.values.auth_scheme,
      auth_header: t.values.auth_header || "Authorization",
      model_suggestions: t.values.model_suggestions,
    }));
    if (t.values.default_model) setModel(t.values.default_model);
    setTestResult(null);
  };

  const customPayload = useMemo(() => {
    const extra: Record<string, string> = {};
    for (const h of custom.extra_headers) {
      if (h.key.trim() && h.value.trim()) extra[h.key.trim()] = h.value.trim();
    }
    return {
      base_url: custom.base_url.trim(),
      models_url: custom.models_url.trim() || undefined,
      kind: custom.kind,
      auth_scheme: custom.auth_scheme,
      auth_header: custom.auth_header.trim() || "Authorization",
      extra_headers: extra,
      model_suggestions: custom.model_suggestions
        .split(",").map((s) => s.trim()).filter(Boolean),
    };
  }, [custom]);

  const testCustom = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await call<any>("test_custom_endpoint", {
        body: { ...customPayload, provider_key: providerKey || undefined },
      });
      if (r.ok) {
        setTestResult({ ok: true, msg: r.sample_model
            ? `Connected. Sample model: ${r.sample_model}`
            : `Connected (${r.status}).` });
      } else {
        setTestResult({ ok: false, msg: r.error || `HTTP ${r.status}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const create = useMutation({
    mutationFn: () => call<any>("create_key", {
      body: {
        name,
        provider: providerId,
        model: model || selected?.default_model,
        provider_key: providerKey || undefined,
        custom: isCustom ? customPayload : undefined,
      },
    }),
    onSuccess: (res) => { setNewKey(res.full_key); qc.invalidateQueries({ queryKey: ["keys"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => call("revoke_key", { body: { id } }),
    onSuccess: () => { toast.success("Key revoked"); qc.invalidateQueries({ queryKey: ["keys"] }); },
  });

  // -------- Live API key test ---------------------------------------------
  // Sends a tiny real chat request through the upstream the key is bound to
  // and shows the result in a dialog: ok/fail, latency, reply, tokens, error.
  const [testingKey, setTestingKey] = useState<{ id: string; name: string } | null>(null);
  const [testKeyResult, setTestKeyResult] = useState<any | null>(null);
  const testKey = useMutation({
    mutationFn: (id: string) => call<any>("test_api_key", { body: { api_key_id: id } }),
    onMutate: () => setTestKeyResult(null),
    onSuccess: (r) => {
      setTestKeyResult(r);
      if (r?.ok) toast.success(`Key works · ${r.latency_ms}ms`);
      else toast.error(r?.error || "Test failed");
    },
    onError: (e: any) => {
      setTestKeyResult({ ok: false, error: e?.message || "Request failed" });
      toast.error(e?.message || "Test failed");
    },
  });

  const reset = () => {
    setOpen(false); setNewKey(null); setName("");
    setProviderId("lovable"); setModel(""); setProviderKey("");
    setCustom(emptyCustom); setTestResult(null);
  };
  const copy = (val: string) => { navigator.clipboard.writeText(val); toast.success("Copied"); };

  // Validation: enable Create button
  const requiresKey = isCustom
    ? custom.auth_scheme !== "none"
    : !selected?.managed;
  const canCreate = !!name && (
    isCustom
      ? !!custom.base_url && (!requiresKey || !!providerKey)
      : (!requiresKey || !!providerKey)
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground text-sm mt-1">Issue keys for each environment. Revoke anytime.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4 mr-2" /> New key
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            {!newKey ? (
              <>
                <DialogHeader><DialogTitle>Create a new API key</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Provider</Label>
                    <Select value={providerId} onValueChange={onProviderChange}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isCustom && customSchema && (
                    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Plug className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Custom endpoint</p>
                      </div>

                      <div>
                        <Label>Template (optional)</Label>
                        <Select value={custom.template} onValueChange={applyTemplate}>
                          <SelectTrigger className="mt-1.5">
                            <SelectValue placeholder="Pick a template to prefill" />
                          </SelectTrigger>
                          <SelectContent>
                            {customSchema.templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Kind</Label>
                        <Select
                          value={custom.kind}
                          onValueChange={(v) => setCustom({ ...custom, kind: v })}
                        >
                          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {customSchema.kinds.map((k) => (
                              <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Base URL</Label>
                        <Input
                          value={custom.base_url}
                          onChange={(e) => setCustom({ ...custom, base_url: e.target.value })}
                          placeholder="https://my-host/v1"
                          className="mt-1.5 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          We'll auto-append <code>/chat/completions</code> (or <code>/messages</code>) if missing.
                        </p>
                      </div>

                      <div>
                        <Label>Models URL (optional)</Label>
                        <Input
                          value={custom.models_url}
                          onChange={(e) => setCustom({ ...custom, models_url: e.target.value })}
                          placeholder="Leave blank to derive from base URL"
                          className="mt-1.5 font-mono text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Auth scheme</Label>
                          <Select
                            value={custom.auth_scheme}
                            onValueChange={(v) => setCustom({ ...custom, auth_scheme: v })}
                          >
                            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {customSchema.auth_schemes.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {(custom.auth_scheme === "header" || custom.auth_scheme === "query") && (
                          <div>
                            <Label>{custom.auth_scheme === "query" ? "Query param name" : "Header name"}</Label>
                            <Input
                              value={custom.auth_header}
                              onChange={(e) => setCustom({ ...custom, auth_header: e.target.value })}
                              placeholder={custom.auth_scheme === "query" ? "key" : "api-key"}
                              className="mt-1.5 font-mono text-sm"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <Label>Model suggestions (comma-separated, optional)</Label>
                        <Textarea
                          value={custom.model_suggestions}
                          onChange={(e) => setCustom({ ...custom, model_suggestions: e.target.value })}
                          placeholder="llama3.1, qwen2.5, gpt-oss:20b"
                          className="mt-1.5 font-mono text-xs"
                          rows={2}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Used as fallback if <code>/models</code> can't be reached.
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <Label>Extra headers</Label>
                          <Button
                            type="button" size="sm" variant="ghost"
                            onClick={() => setCustom({
                              ...custom,
                              extra_headers: [...custom.extra_headers, { key: "", value: "" }],
                            })}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add
                          </Button>
                        </div>
                        {custom.extra_headers.length === 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            e.g. <code>api-version: 2024-10-21</code> for Azure.
                          </p>
                        )}
                        <div className="space-y-2 mt-1.5">
                          {custom.extra_headers.map((h, i) => (
                            <div key={i} className="flex gap-2">
                              <Input
                                value={h.key} placeholder="header-name"
                                onChange={(e) => {
                                  const next = [...custom.extra_headers];
                                  next[i] = { ...next[i], key: e.target.value };
                                  setCustom({ ...custom, extra_headers: next });
                                }}
                                className="font-mono text-xs"
                              />
                              <Input
                                value={h.value} placeholder="value"
                                onChange={(e) => {
                                  const next = [...custom.extra_headers];
                                  next[i] = { ...next[i], value: e.target.value };
                                  setCustom({ ...custom, extra_headers: next });
                                }}
                                className="font-mono text-xs"
                              />
                              <Button
                                type="button" size="icon" variant="ghost"
                                onClick={() => setCustom({
                                  ...custom,
                                  extra_headers: custom.extra_headers.filter((_, j) => j !== i),
                                })}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="model">Default model</Label>
                    <Input id="model" value={model || selected?.default_model || ""} onChange={(e) => setModel(e.target.value)} className="mt-1.5 font-mono text-sm" placeholder={isCustom ? "e.g. llama3.1" : ""} />
                    {selected && selected.model_suggestions.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Suggestions: {selected.model_suggestions.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                  {requiresKey && (
                    <div>
                      <Label htmlFor="ok">{isCustom ? "Provider API key" : `${selected?.label} API key`}</Label>
                      <Input id="ok" type="password" value={providerKey} onChange={(e) => setProviderKey(e.target.value)} placeholder={selected?.key_placeholder || "your-api-key"} className="mt-1.5 font-mono text-sm" />
                      {!isCustom && selected && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Encrypted at rest. <a href={selected.get_key_url} target="_blank" rel="noreferrer" className="underline">Get a key →</a>
                        </p>
                      )}
                    </div>
                  )}

                  {isCustom && (
                    <div className="space-y-2">
                      <Button
                        type="button" variant="outline" size="sm"
                        onClick={testCustom}
                        disabled={testing || !custom.base_url}
                      >
                        {testing ? "Testing…" : "Test connection"}
                      </Button>
                      {testResult && (
                        <div className={`text-xs flex items-start gap-2 p-2 rounded-md ${testResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                          {testResult.ok ? <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                          <span className="break-all">{testResult.msg}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                  <Button onClick={() => create.mutate()} disabled={create.isPending || !canCreate}>
                    {create.isPending ? "Creating…" : "Create key"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" /> Key created</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">Copy this key now. You won't be able to see it again.</p>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
                    <code className="flex-1 truncate">{newKey}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(newKey)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <DialogFooter><Button onClick={reset}>Done</Button></DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Your keys</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-24" /> :
            (data?.keys?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No keys yet. Click <strong>New key</strong> to create one.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.keys.map((k: any) => (
                  <div key={k.id} className="py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{k.name}</p>
                        {!k.is_active && <Badge variant="outline" className="text-xs">revoked</Badge>}
                        <Badge variant="secondary" className="text-xs">{k.provider}</Badge>
                        {k.provider === "custom" && k.custom_base_url && (
                          <Badge variant="outline" className="text-xs font-mono">
                            {(() => { try { return new URL(k.custom_base_url).host; } catch { return k.custom_base_url; } })()}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="font-mono">{k.key_prefix}…</span>
                        <span>·</span>
                        <span>{k.model_default}</span>
                        <span>·</span>
                        <span>last used {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}</span>
                      </div>
                    </div>
                    {k.is_active && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline" size="sm"
                          disabled={testKey.isPending && testingKey?.id === k.id}
                          onClick={() => { setTestingKey({ id: k.id, name: k.name }); testKey.mutate(k.id); }}
                          title="Send a tiny test request through this key's upstream"
                        >
                          {testKey.isPending && testingKey?.id === k.id
                            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Testing…</>
                            : <><Beaker className="h-3.5 w-3.5 mr-1.5" />Test</>}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => revoke.mutate(k.id)} title="Revoke key">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Use it in your app</CardTitle></CardHeader>
        <CardContent>
          <pre className="rounded-md border border-border bg-muted/40 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
{`from openai import OpenAI

client = OpenAI(
    base_url="${PROXY_URL.replace(/\/proxy$/, "/proxy")}",
    api_key="ag_live_••••••••",
)

# Note: pass the proxy URL as base_url and your AnveGuard key as api_key.
# The endpoint follows the OpenAI Chat Completions schema.`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default Keys;
