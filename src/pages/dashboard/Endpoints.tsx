import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Plug, Pencil, Trash2, X, Check, Beaker, KeyRound, RefreshCw, AlertTriangle, Activity, Ban, AlertCircle } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";

interface CustomSchema {
  kinds: { id: string; label: string }[];
  auth_schemes: { id: string; label: string }[];
  templates: {
    id: string;
    label: string;
    description?: string;
    values: {
      kind: string;
      base_url: string;
      auth_scheme: string;
      auth_header?: string;
      default_model?: string;
      model_suggestions?: string;
      models_url?: string;
      path_prefix?: string;
      chat_path?: string;
      models_path?: string;
      response_format?: string;
      extra_headers?: Record<string, string>;
    };
  }[];
}

interface EndpointRow {
  id: string;
  name: string;
  base_url: string;
  models_url: string | null;
  kind: string;
  auth_scheme: string;
  auth_header: string | null;
  extra_headers: Record<string, string>;
  model_suggestions: string[];
  default_model: string | null;
  path_prefix: string | null;
  chat_path: string | null;
  models_path: string | null;
  response_format: string | null;
  has_key: boolean;
  key_count: number;
  updated_at: string;
}

interface FormState {
  id?: string;
  template: string;
  name: string;
  base_url: string;
  models_url: string;
  kind: string;
  auth_scheme: string;
  auth_header: string;
  default_model: string;
  model_suggestions: string;
  provider_key: string;
  clear_provider_key: boolean;
  extra_headers: { key: string; value: string }[];
  path_prefix: string;
  chat_path: string;
  models_path: string;
  response_format: string;
}

const emptyForm: FormState = {
  template: "",
  name: "",
  base_url: "",
  models_url: "",
  kind: "openai_compatible",
  auth_scheme: "bearer",
  auth_header: "Authorization",
  default_model: "",
  model_suggestions: "",
  provider_key: "",
  clear_provider_key: false,
  extra_headers: [],
  path_prefix: "",
  chat_path: "",
  models_path: "",
  response_format: "chat_completions",
};

const Endpoints = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<{ endpoints: EndpointRow[] }>("list_endpoints"),
  });
  const { data: provData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => call<{ providers: any[]; custom_schema: CustomSchema }>("list_providers"),
  });
  const customSchema = provData?.custom_schema;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<EndpointRow | null>(null);
  const [usageEndpoint, setUsageEndpoint] = useState<EndpointRow | null>(null);

  const usageQuery = useQuery({
    enabled: !!usageEndpoint,
    queryKey: ["endpoint_usage", usageEndpoint?.id],
    queryFn: () => call<{ usage: any[] }>("endpoint_usage", {
      query: { endpoint_id: usageEndpoint!.id, limit: "25" },
    }),
  });
  const usageRow = usageQuery.data?.usage?.[0];
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
    checks?: { name: string; ok: boolean; detail?: string }[];
    chat_probe?: { ok: boolean; status?: number; latency_ms?: number; model?: string; error?: string | null } | null;
  } | null>(null);
  const [probeChat, setProbeChat] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const [modelsResult, setModelsResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const isEdit = !!form.id;

  const startCreate = () => {
    setForm(emptyForm);
    setTestResult(null);
    setLiveModels(null);
    setModelsResult(null);
    setOpen(true);
  };

  const startEdit = (e: EndpointRow) => {
    setForm({
      id: e.id,
      template: "",
      name: e.name,
      base_url: e.base_url,
      models_url: e.models_url ?? "",
      kind: e.kind,
      auth_scheme: e.auth_scheme,
      auth_header: e.auth_header || "Authorization",
      default_model: e.default_model ?? "",
      model_suggestions: (e.model_suggestions || []).join(", "),
      provider_key: "",
      clear_provider_key: false,
      extra_headers: Object.entries(e.extra_headers || {}).map(([key, value]) => ({ key, value })),
      path_prefix: e.path_prefix ?? "",
      chat_path: e.chat_path ?? "",
      models_path: e.models_path ?? "",
      response_format: e.response_format ?? (e.kind === "anthropic" ? "anthropic_messages" : "chat_completions"),
    });
    setTestResult(null);
    setLiveModels(null);
    setModelsResult(null);
    setOpen(true);
  };

  const applyTemplate = (templateId: string) => {
    const t = customSchema?.templates.find((x) => x.id === templateId);
    if (!t) return;
    const v = t.values;
    const fmt = v.response_format
      || (v.kind === "anthropic" ? "anthropic_messages" : "chat_completions");
    setForm((c) => ({
      ...c,
      template: templateId,
      // Preserve user's chosen Name if they already typed one; otherwise prefill from label.
      name: c.name.trim() ? c.name : t.label,
      kind: v.kind,
      base_url: v.base_url,
      models_url: v.models_url ?? "",
      auth_scheme: v.auth_scheme,
      auth_header: v.auth_header || (v.auth_scheme === "query" ? "key" : "Authorization"),
      default_model: v.default_model || c.default_model,
      model_suggestions: v.model_suggestions || c.model_suggestions,
      path_prefix: v.path_prefix ?? "",
      chat_path: v.chat_path ?? "",
      models_path: v.models_path ?? "",
      response_format: fmt,
      extra_headers: v.extra_headers
        ? Object.entries(v.extra_headers).map(([key, value]) => ({ key, value }))
        : c.extra_headers,
    }));
    setTestResult(null);
    setLiveModels(null);
    setModelsResult(null);
  };

  // When auth scheme changes, give it a sensible default header/param name
  useEffect(() => {
    if (form.auth_scheme === "query" && form.auth_header === "Authorization") {
      setForm((f) => ({ ...f, auth_header: "key" }));
    }
    if (form.auth_scheme === "header" && (form.auth_header === "key" || !form.auth_header)) {
      setForm((f) => ({ ...f, auth_header: "api-key" }));
    }
    if ((form.auth_scheme === "bearer" || form.auth_scheme === "x-api-key" || form.auth_scheme === "none")
        && form.auth_header !== "Authorization") {
      setForm((f) => ({ ...f, auth_header: "Authorization" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.auth_scheme]);

  // Keep response_format consistent with the selected kind by default
  useEffect(() => {
    setForm((f) => {
      if (f.kind === "anthropic" && f.response_format !== "anthropic_messages") {
        return { ...f, response_format: "anthropic_messages" };
      }
      if (f.kind !== "anthropic" && f.response_format === "anthropic_messages") {
        return { ...f, response_format: "chat_completions" };
      }
      return f;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.kind]);

  const buildPayload = () => {
    const extra: Record<string, string> = {};
    for (const h of form.extra_headers) {
      if (h.key.trim() && h.value.trim()) extra[h.key.trim()] = h.value.trim();
    }
    return {
      id: form.id,
      name: form.name.trim(),
      base_url: form.base_url.trim(),
      models_url: form.models_url.trim() || undefined,
      kind: form.kind,
      auth_scheme: form.auth_scheme,
      auth_header: form.auth_header.trim() || (form.auth_scheme === "query" ? "key" : "Authorization"),
      extra_headers: extra,
      model_suggestions: form.model_suggestions.split(",").map((s) => s.trim()).filter(Boolean),
      default_model: form.default_model.trim() || undefined,
      provider_key: form.provider_key || undefined,
      clear_provider_key: form.clear_provider_key,
      path_prefix: form.path_prefix.trim() || undefined,
      chat_path: form.chat_path.trim() || undefined,
      models_path: form.models_path.trim() || undefined,
      response_format: form.response_format || undefined,
    };
  };

  const requiresKey = form.auth_scheme !== "none";
  const hasKeyOnRecord = isEdit && data?.endpoints.find((e) => e.id === form.id)?.has_key;
  const canSave =
    !!form.name && !!form.base_url &&
    (!requiresKey || hasKeyOnRecord || !!form.provider_key);

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const base = isEdit && hasKeyOnRecord && !form.provider_key
        ? { id: form.id }
        : buildPayload();
      const r = await call<any>("test_endpoint", {
        body: { ...base, probe_chat: probeChat, probe_model: form.default_model || undefined },
      });
      const fmt = r.response_format ? ` · format: ${r.response_format}` : "";
      const chat = r.chat_url ? `\nChat URL: ${r.chat_url}` : "";
      if (r.ok) {
        setTestResult({
          ok: true,
          checks: r.checks,
          chat_probe: r.chat_probe,
          msg: (r.sample_model
            ? `Connected (${r.latency_ms}ms). ${r.model_count} models · sample: ${r.sample_model}${fmt}`
            : `Connected (${r.status}, ${r.latency_ms}ms).${fmt}`) + chat,
        });
      } else {
        setTestResult({
          ok: false,
          checks: r.checks,
          chat_probe: r.chat_probe,
          msg: r.error || `HTTP ${r.status ?? "?"}`,
        });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    setFetchingModels(true);
    setModelsResult(null);
    try {
      const useStoredKey = isEdit && hasKeyOnRecord && !form.provider_key;
      const r = await call<any>("list_endpoint_models", {
        body: useStoredKey
          ? { id: form.id, model_suggestions: form.model_suggestions.split(",").map((s) => s.trim()).filter(Boolean) }
          : buildPayload(),
      });
      const models: string[] = Array.isArray(r.models) ? r.models : [];
      setLiveModels(models);
      if (r.source === "live" && models.length) {
        setModelsResult({
          ok: true,
          msg: `Loaded ${models.length} model${models.length === 1 ? "" : "s"} from upstream (${r.latency_ms ?? "?"}ms).`,
        });
      } else if (models.length) {
        setModelsResult({
          ok: false,
          msg: `${r.error || r.warning || "Upstream unavailable"} — showing ${models.length} fallback suggestion(s).`,
        });
      } else {
        setModelsResult({
          ok: false,
          msg: r.error || "Upstream returned no models. Add fallback suggestions below.",
        });
      }
    } catch (e: any) {
      setModelsResult({ ok: false, msg: e.message || String(e) });
    } finally {
      setFetchingModels(false);
    }
  };

  const save = useMutation({
    mutationFn: () => call<any>("save_endpoint", { body: buildPayload() }),
    onSuccess: () => {
      toast.success(isEdit ? "Endpoint updated" : "Endpoint created");
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => call("delete_endpoint", { body: { id } }),
    onSuccess: () => {
      toast.success("Endpoint deleted");
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hostOf = (url: string) => {
    try { return new URL(url).host; } catch { return url; }
  };

  const endpoints = data?.endpoints ?? [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Custom Endpoints</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Save self-hosted or third-party LLM endpoints once and reuse them across API keys.
          </p>
        </div>
        <Button
          onClick={startCreate}
          className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" /> New endpoint
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Saved endpoints</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-24" /> :
            endpoints.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">
                <Plug className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No endpoints yet.</p>
                <p className="mt-1">Click <strong>New endpoint</strong> to add Ollama, vLLM, Azure, Groq, or any custom URL.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {endpoints.map((e) => (
                  <div key={e.id} className="py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{e.name}</p>
                        <Badge variant="outline" className="text-xs font-mono">{hostOf(e.base_url)}</Badge>
                        <Badge variant="secondary" className="text-xs">
                          {e.kind === "anthropic" ? "anthropic" : "openai-compat"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          auth: {e.auth_scheme}
                        </Badge>
                        {e.has_key && (
                          <Badge variant="outline" className="text-xs">
                            <KeyRound className="h-3 w-3 mr-1" /> key stored
                          </Badge>
                        )}
                        {e.key_count > 0 && (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                            {e.key_count} key{e.key_count === 1 ? "" : "s"} using this
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground font-mono truncate">
                        {e.base_url}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setUsageEndpoint(e)} title="View usage">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(e)} title="Edit">
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(e)} title="Delete">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit endpoint" : "New custom endpoint"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Production Ollama"
                className="mt-1.5"
              />
            </div>

            {customSchema && !isEdit && (
              <div>
                <Label>Template (optional)</Label>
                <Select value={form.template} onValueChange={applyTemplate}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Pick a provider to prefill URL, auth, models…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {customSchema.templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex flex-col items-start py-0.5">
                          <span className="font-medium">{t.label}</span>
                          {t.description && (
                            <span className="text-[11px] text-muted-foreground">
                              {t.description}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.template && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Template applied — review and tweak before saving.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {customSchema?.kinds.map((k) => (
                    <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Base URL</Label>
              <Input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder="https://my-host/v1"
                className="mt-1.5 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                We'll append the chat path automatically (e.g. <code>/chat/completions</code>, <code>/messages</code>, or <code>/responses</code>). Use <em>Path prefix</em> below for things like <code>/v1</code> or <code>/openai/v1</code>.
              </p>
            </div>

            <div>
              <Label>Models URL (optional)</Label>
              <Input
                value={form.models_url}
                onChange={(e) => setForm({ ...form, models_url: e.target.value })}
                placeholder="Leave blank to derive from base URL"
                className="mt-1.5 font-mono text-sm"
              />
            </div>

            {/* Request options — path prefix, explicit paths, response format */}
            <div className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Request options</Label>
                <span className="text-xs text-muted-foreground">
                  Advanced — leave blank for sane defaults
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Path prefix</Label>
                  <Input
                    value={form.path_prefix}
                    onChange={(e) => setForm({ ...form, path_prefix: e.target.value })}
                    placeholder="/v1, /openai/v1"
                    className="mt-1 font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Inserted between base URL and the chat/models path.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Response format</Label>
                  <Select
                    value={form.response_format}
                    onValueChange={(v) => setForm({ ...form, response_format: v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chat_completions">OpenAI Chat Completions</SelectItem>
                      <SelectItem value="responses">OpenAI Responses API</SelectItem>
                      <SelectItem value="anthropic_messages">Anthropic Messages</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    We translate to/from chat-completions automatically.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Chat path override</Label>
                  <Input
                    value={form.chat_path}
                    onChange={(e) => setForm({ ...form, chat_path: e.target.value })}
                    placeholder="/chat/completions"
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Models path override</Label>
                  <Input
                    value={form.models_path}
                    onChange={(e) => setForm({ ...form, models_path: e.target.value })}
                    placeholder="/models"
                    className="mt-1 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Auth scheme</Label>
                <Select value={form.auth_scheme} onValueChange={(v) => setForm({ ...form, auth_scheme: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {customSchema?.auth_schemes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.auth_scheme === "header" || form.auth_scheme === "query") && (
                <div>
                  <Label>{form.auth_scheme === "query" ? "Query param name" : "Header name"}</Label>
                  <Input
                    value={form.auth_header}
                    onChange={(e) => setForm({ ...form, auth_header: e.target.value })}
                    placeholder={form.auth_scheme === "query" ? "key" : "api-key"}
                    className="mt-1.5 font-mono text-sm"
                  />
                </div>
              )}
            </div>

            {requiresKey && (
              <div>
                <Label>
                  Provider API key
                  {hasKeyOnRecord && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (leave blank to keep existing)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={form.provider_key}
                  onChange={(e) => setForm({ ...form, provider_key: e.target.value, clear_provider_key: false })}
                  placeholder={hasKeyOnRecord ? "•••••••• (stored, encrypted)" : "your-api-key"}
                  className="mt-1.5 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">Encrypted at rest with AES-GCM.</p>
              </div>
            )}

            {/* Live model listing */}
            <div className="rounded-md border border-border/60 p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-sm font-medium">Available models</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Hit <code>/models</code> on this endpoint live, then pick the default.
                  </p>
                </div>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={fetchModels}
                  disabled={fetchingModels || !form.base_url}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${fetchingModels ? "animate-spin" : ""}`} />
                  {fetchingModels ? "Fetching…" : "Refresh from upstream"}
                </Button>
              </div>

              {modelsResult && (
                <div className={`text-xs flex items-start gap-2 p-2 rounded-md ${
                  modelsResult.ok ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}>
                  {modelsResult.ok
                    ? <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  <span className="break-all">{modelsResult.msg}</span>
                </div>
              )}

              <div>
                <Label className="text-xs">Default model</Label>
                {liveModels && liveModels.length > 0 ? (
                  <div className="flex gap-2 mt-1">
                    <Select
                      value={liveModels.includes(form.default_model) ? form.default_model : ""}
                      onValueChange={(v) => setForm({ ...form, default_model: v })}
                    >
                      <SelectTrigger className="font-mono text-xs">
                        <SelectValue placeholder="Pick from live list…" />
                      </SelectTrigger>
                      <SelectContent>
                        {liveModels.map((m) => (
                          <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={form.default_model}
                      onChange={(e) => setForm({ ...form, default_model: e.target.value })}
                      placeholder="or type manually"
                      className="font-mono text-xs"
                    />
                  </div>
                ) : (
                  <Input
                    value={form.default_model}
                    onChange={(e) => setForm({ ...form, default_model: e.target.value })}
                    placeholder="e.g. llama3.1 — refresh above to pick from a list"
                    className="mt-1 font-mono text-xs"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Fallback model suggestions</Label>
                  {liveModels && liveModels.length > 0 && (
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setForm({ ...form, model_suggestions: liveModels.join(", ") })}
                    >
                      Use live list as fallback
                    </Button>
                  )}
                </div>
                <Textarea
                  value={form.model_suggestions}
                  onChange={(e) => setForm({ ...form, model_suggestions: e.target.value })}
                  placeholder="llama3.1, qwen2.5, gpt-oss:20b"
                  className="mt-1 font-mono text-xs"
                  rows={2}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Shown if <code>/models</code> can't be reached at request time.
                </p>
              </div>
            </div>


            <div>
              <div className="flex items-center justify-between">
                <Label>Extra headers</Label>
                <Button
                  type="button" size="sm" variant="ghost"
                  onClick={() => setForm({
                    ...form,
                    extra_headers: [...form.extra_headers, { key: "", value: "" }],
                  })}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {form.extra_headers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  e.g. <code>api-version: 2024-10-21</code> for Azure.
                </p>
              )}
              <div className="space-y-2 mt-1.5">
                {form.extra_headers.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={h.key} placeholder="header-name"
                      onChange={(e) => {
                        const next = [...form.extra_headers];
                        next[i] = { ...next[i], key: e.target.value };
                        setForm({ ...form, extra_headers: next });
                      }}
                      className="font-mono text-xs"
                    />
                    <Input
                      value={h.value} placeholder="value"
                      onChange={(e) => {
                        const next = [...form.extra_headers];
                        next[i] = { ...next[i], value: e.target.value };
                        setForm({ ...form, extra_headers: next });
                      }}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button" size="icon" variant="ghost"
                      onClick={() => setForm({
                        ...form,
                        extra_headers: form.extra_headers.filter((_, j) => j !== i),
                      })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={test}
                  disabled={testing || !form.base_url}
                >
                  <Beaker className="h-4 w-4 mr-2" />
                  {testing ? "Testing…" : "Test connection"}
                </Button>
                <label className="text-xs flex items-center gap-2 text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={probeChat}
                    onChange={(e) => setProbeChat(e.target.checked)}
                  />
                  Also send a tiny chat completion probe
                </label>
              </div>
              {testResult && (
                <div className={`text-xs rounded-md border ${
                  testResult.ok
                    ? "border-primary/30 bg-primary/5 text-foreground"
                    : "border-destructive/40 bg-destructive/5 text-foreground"
                }`}>
                  <div className={`flex items-start gap-2 px-2.5 py-2 ${
                    testResult.ok ? "text-primary" : "text-destructive"
                  }`}>
                    {testResult.ok
                      ? <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      : <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                    <span className="break-all whitespace-pre-wrap">{testResult.msg}</span>
                  </div>
                  {testResult.checks && testResult.checks.length > 0 && (
                    <ul className="border-t border-border/50 px-2.5 py-2 space-y-1">
                      {testResult.checks.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          {c.ok
                            ? <Check className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
                            : <X className="h-3 w-3 shrink-0 mt-0.5 text-destructive" />}
                          <span className="text-foreground/90">
                            <span className="font-medium">{c.name}</span>
                            {c.detail && (
                              <span className="text-muted-foreground"> — <span className="break-all">{c.detail}</span></span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {testResult.chat_probe && (
                    <div className="border-t border-border/50 px-2.5 py-2 text-muted-foreground">
                      Chat probe: {testResult.chat_probe.ok
                        ? <span className="text-primary">OK</span>
                        : <span className="text-destructive">failed</span>}
                      {testResult.chat_probe.model && <> · model <code className="text-foreground">{testResult.chat_probe.model}</code></>}
                      {typeof testResult.chat_probe.latency_ms === "number" && <> · {testResult.chat_probe.latency_ms}ms</>}
                      {testResult.chat_probe.error && (
                        <div className="mt-1 break-all text-destructive">{testResult.chat_probe.error}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
              {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create endpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.key_count ? (
                <>This endpoint is currently used by <strong>{confirmDelete.key_count} API key(s)</strong>.
                You'll need to revoke or migrate them first.</>
              ) : (
                <>The encrypted provider key will also be removed. This can't be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && del.mutate(confirmDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Usage dialog */}
      <Dialog open={!!usageEndpoint} onOpenChange={(o) => !o && setUsageEndpoint(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Usage · {usageEndpoint?.name}
            </DialogTitle>
          </DialogHeader>

          {usageQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-40" />
            </div>
          ) : !usageRow ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No data yet.</div>
          ) : (
            <div className="space-y-5">
              {/* Stat tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="API keys" value={`${usageRow.stats.active_key_count}/${usageRow.stats.key_count}`} hint="active / total" />
                <StatTile label="Requests" value={usageRow.stats.request_count} />
                <StatTile label="Blocked" value={usageRow.stats.blocked_count} tone={usageRow.stats.blocked_count ? "warn" : undefined} />
                <StatTile label="Avg latency" value={`${usageRow.stats.avg_latency_ms}ms`} />
              </div>
              {usageRow.stats.last_request_at && (
                <p className="text-xs text-muted-foreground">
                  Last request {new Date(usageRow.stats.last_request_at).toLocaleString()}
                </p>
              )}

              {/* Bound API keys */}
              <div>
                <h3 className="text-sm font-medium mb-2">Bound API keys ({usageRow.keys.length})</h3>
                {usageRow.keys.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 px-3 rounded-md border border-dashed">
                    No API keys are pointing to this endpoint yet.
                  </div>
                ) : (
                  <div className="rounded-md border divide-y">
                    {usageRow.keys.map((k: any) => (
                      <div key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="font-medium truncate">{k.name}</span>
                        <code className="text-xs text-muted-foreground">{k.key_prefix}…</code>
                        {k.is_active ? (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">revoked</Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleString()}` : "never used"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent requests */}
              <div>
                <h3 className="text-sm font-medium mb-2">Recent requests ({usageRow.recent_requests.length})</h3>
                {usageRow.recent_requests.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-3 px-3 rounded-md border border-dashed">
                    No requests have been routed through this endpoint yet.
                  </div>
                ) : (
                  <div className="rounded-md border divide-y max-h-80 overflow-y-auto">
                    {usageRow.recent_requests.map((r: any) => {
                      const blocked = typeof r.status === "string" && r.status.startsWith("blocked");
                      const errored = r.status === "error";
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                          {blocked
                            ? <Ban className="h-3.5 w-3.5 text-destructive shrink-0" />
                            : errored
                              ? <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              : <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                          <span className="text-muted-foreground tabular-nums shrink-0">
                            {new Date(r.created_at).toLocaleTimeString()}
                          </span>
                          <span className="font-medium truncate">{r.api_key_name}</span>
                          <code className="text-muted-foreground truncate">{r.model ?? "—"}</code>
                          <Badge variant="outline" className={`ml-auto text-[10px] ${
                            blocked || errored ? "bg-destructive/10 text-destructive border-destructive/30" : ""
                          }`}>
                            {r.status}
                          </Badge>
                          <span className="text-muted-foreground tabular-nums shrink-0 w-14 text-right">
                            {r.latency_ms ?? 0}ms
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => usageQuery.refetch()} disabled={usageQuery.isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${usageQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={() => setUsageEndpoint(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function StatTile({
  label, value, hint, tone,
}: { label: string; value: React.ReactNode; hint?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-md border p-3 ${tone === "warn" ? "border-destructive/30 bg-destructive/5" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export default Endpoints;
