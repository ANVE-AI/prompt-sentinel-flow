import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Plug, Pencil, Trash2, X, Check, Beaker, KeyRound, RefreshCw, AlertTriangle, Activity, Ban, AlertCircle, Download, Upload, Save } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { z } from "zod";

// -------- Endpoint form validation -----------------------------------------
// Validates the fields a template prefills (and that the upstream actually
// needs) BEFORE allowing Test or Save. Mirrors the server-side checks in the
// `save_endpoint` action so users get instant inline feedback rather than a
// generic API error after submitting.
//
// Rules:
// - name + base_url required, base_url must parse as http(s) URL.
// - For non-"none" auth schemes, an auth_header/param name is required.
// - Path overrides (path_prefix, chat_path, models_path, models_url) must be
//   either empty or syntactically valid (start with "/" or be absolute URL).
// - default_model is recommended but not required (warning, not error).
const PathOverride = z
  .string()
  .max(500, "Too long")
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v),
    { message: "Must start with '/' or be a full http(s) URL" },
  );

const endpointFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name must be ≤120 chars"),
    base_url: z
      .string()
      .trim()
      .min(1, "Base URL is required")
      .max(500, "Base URL too long")
      .refine((v) => {
        try {
          const u = new URL(v);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch { return false; }
      }, "Must be a valid http(s) URL"),
    kind: z.string().min(1, "Kind is required"),
    auth_scheme: z.string().min(1, "Auth scheme is required"),
    auth_header: z.string().trim().max(120, "Header name too long"),
    response_format: z.enum(["chat_completions", "responses", "anthropic_messages"], {
      message: "Pick a response format",
    }),
    models_url: PathOverride,
    path_prefix: PathOverride,
    chat_path: PathOverride,
    models_path: PathOverride,
    default_model: z.string().trim().max(200, "Model id too long"),
  })
  .superRefine((v, ctx) => {
    // Auth header/param name is mandatory for any scheme that uses one.
    if (v.auth_scheme !== "none" && v.auth_scheme !== "bearer" && v.auth_scheme !== "x-api-key") {
      if (!v.auth_header.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["auth_header"],
          message: v.auth_scheme === "query"
            ? "Query parameter name is required for 'query' auth"
            : "Header name is required for 'header' auth",
        });
      }
    }
    // Anthropic kind only makes sense with anthropic_messages format.
    if (v.kind === "anthropic" && v.response_format !== "anthropic_messages") {
      ctx.addIssue({
        code: "custom", path: ["response_format"],
        message: "Anthropic kind requires the 'anthropic_messages' response format",
      });
    }
  });

type EndpointFormErrors = Partial<Record<
  "name" | "base_url" | "kind" | "auth_scheme" | "auth_header" | "response_format"
  | "models_url" | "path_prefix" | "chat_path" | "models_path" | "default_model",
  string
>>;

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
  const [modelFilter, setModelFilter] = useState("");
  const [modelsResult, setModelsResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // True only when the most recent upstream /models fetch succeeded with `source: "live"`.
  // Persisting `default_model` is gated on this so we never silently save a stale picker.
  const [lastRefreshOk, setLastRefreshOk] = useState(false);
  // Tracks the `default_model` currently stored on the endpoint record so the
  // "Save as default" button can show a dirty state and disable when unchanged.
  const [savedDefaultModel, setSavedDefaultModel] = useState<string>("");
  const [savingDefault, setSavingDefault] = useState(false);
  // Template preview — selecting a template in the dropdown doesn't immediately
  // overwrite the form. It populates this state instead, which renders a diff
  // panel so the user can review every field before confirming "Apply".
  const [previewTemplateId, setPreviewTemplateId] = useState<string>("");

  const isEdit = !!form.id;

  const startCreate = () => {
    setForm(emptyForm);
    setTestResult(null);
    setLiveModels(null);
    setModelsResult(null);
    setLastRefreshOk(false);
    setSavedDefaultModel("");
    setPreviewTemplateId("");
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
    setLastRefreshOk(false);
    setSavedDefaultModel(e.default_model ?? "");
    setPreviewTemplateId("");
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
    setLastRefreshOk(false);
    setPreviewTemplateId("");
  };

  // -------- Template diff preview ----------------------------------------
  // Computes a per-field comparison between the current form values and what
  // the selected preview template would set, so the user can review every
  // change before clicking "Apply". Returns rows for ALL fields the template
  // would touch (including unchanged ones) so nothing is hidden.
  type DiffRow = {
    label: string;
    field: keyof FormState;
    current: string;
    next: string;
    status: "unchanged" | "change" | "add";
  };
  const previewDiff = useMemo<{ template: NonNullable<CustomSchema["templates"][number]>; rows: DiffRow[] } | null>(() => {
    if (!previewTemplateId || !customSchema) return null;
    const t = customSchema.templates.find((x) => x.id === previewTemplateId);
    if (!t) return null;
    const v = t.values;
    const fmt = v.response_format
      || (v.kind === "anthropic" ? "anthropic_messages" : "chat_completions");
    const nextHeaderName = v.auth_header || (v.auth_scheme === "query" ? "key" : "Authorization");
    const nextExtraHeaders = v.extra_headers
      ? Object.entries(v.extra_headers).map(([k, val]) => `${k}: ${val}`).join(", ")
      : form.extra_headers.map((h) => `${h.key}: ${h.value}`).join(", ");
    const curExtraHeaders = form.extra_headers.map((h) => `${h.key}: ${h.value}`).join(", ");

    const fields: Array<{ label: string; field: keyof FormState; current: string; next: string }> = [
      { label: "Name",            field: "name",              current: form.name,                 next: form.name.trim() ? form.name : t.label },
      { label: "Kind",            field: "kind",              current: form.kind,                 next: v.kind },
      { label: "Base URL",        field: "base_url",          current: form.base_url,             next: v.base_url },
      { label: "Models URL",      field: "models_url",        current: form.models_url,           next: v.models_url ?? "" },
      { label: "Auth scheme",     field: "auth_scheme",       current: form.auth_scheme,          next: v.auth_scheme },
      { label: "Auth header/param", field: "auth_header",     current: form.auth_header,          next: nextHeaderName },
      { label: "Default model",   field: "default_model",     current: form.default_model,        next: v.default_model || form.default_model },
      { label: "Model suggestions", field: "model_suggestions", current: form.model_suggestions, next: v.model_suggestions || form.model_suggestions },
      { label: "Path prefix",     field: "path_prefix",       current: form.path_prefix,          next: v.path_prefix ?? "" },
      { label: "Chat path",       field: "chat_path",         current: form.chat_path,            next: v.chat_path ?? "" },
      { label: "Models path",     field: "models_path",       current: form.models_path,          next: v.models_path ?? "" },
      { label: "Response format", field: "response_format",   current: form.response_format,      next: fmt },
      { label: "Extra headers",   field: "extra_headers",     current: curExtraHeaders,           next: nextExtraHeaders },
    ];
    const rows: DiffRow[] = fields.map((f) => ({
      ...f,
      status: f.current === f.next ? "unchanged" : (f.current.trim() === "" ? "add" : "change"),
    }));
    return { template: t, rows };
  }, [previewTemplateId, customSchema, form]);

  const changedCount = previewDiff?.rows.filter((r) => r.status !== "unchanged").length ?? 0;
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

  // Validate the template-prefilled fields on every change. Errors are surfaced
  // inline next to each field AND in a summary banner above the action buttons.
  // Both Test connection and Save are gated on `validation.success` so users
  // can't fire half-configured requests at upstream providers.
  const validation = useMemo(() => {
    const r = endpointFormSchema.safeParse(form);
    if (r.success) return { success: true as const, errors: {} as EndpointFormErrors };
    const errors: EndpointFormErrors = {};
    for (const issue of r.error.issues) {
      const key = issue.path[0] as keyof EndpointFormErrors | undefined;
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return { success: false as const, errors };
  }, [form]);

  const errorEntries = Object.entries(validation.errors) as Array<[keyof EndpointFormErrors, string]>;
  const FIELD_LABELS: Record<keyof EndpointFormErrors, string> = {
    name: "Name", base_url: "Base URL", kind: "Kind",
    auth_scheme: "Auth scheme", auth_header: "Auth header/param",
    response_format: "Response format",
    models_url: "Models URL", path_prefix: "Path prefix",
    chat_path: "Chat path", models_path: "Models path",
    default_model: "Default model",
  };

  const canSave = validation.success && (!requiresKey || hasKeyOnRecord || !!form.provider_key);
  const canTest = validation.success;

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
    setLastRefreshOk(false);
    try {
      const useStoredKey = isEdit && hasKeyOnRecord && !form.provider_key;
      const r = await call<any>("list_endpoint_models", {
        body: useStoredKey
          ? { id: form.id, model_suggestions: form.model_suggestions.split(",").map((s) => s.trim()).filter(Boolean) }
          : buildPayload(),
      });
      const models: string[] = Array.isArray(r.models) ? r.models : [];
      setLiveModels(models);
      const shapeNote = r.shape && r.shape !== "unknown" ? ` · shape: ${r.shape}` : "";
      if (r.source === "live" && models.length) {
        setLastRefreshOk(true);
        setModelsResult({
          ok: true,
          msg: `Loaded ${models.length} model${models.length === 1 ? "" : "s"} from upstream (${r.latency_ms ?? "?"}ms)${shapeNote}.`,
        });
      } else if (models.length) {
        setModelsResult({
          ok: false,
          msg: `${r.error || r.warning || "Upstream unavailable"} — showing ${models.length} fallback suggestion(s)${shapeNote}.`,
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

  // Persist `default_model` to the saved endpoint record.
  // Gated behind `lastRefreshOk` (a successful live upstream refresh in this session)
  // so we never store a model id that hasn't been confirmed against the provider.
  const persistDefaultModel = async (force = false) => {
    if (!isEdit || !form.id) return;
    const chosen = form.default_model.trim();
    if (!chosen) {
      toast.error("Pick a model first.");
      return;
    }
    setSavingDefault(true);
    try {
      const r = await call<{ ok: boolean; default_model: string; forced?: boolean }>(
        "set_endpoint_default_model",
        { body: { id: form.id, default_model: chosen, force } },
      );
      setSavedDefaultModel(r.default_model);
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      toast.success(
        r.forced
          ? `Saved "${r.default_model}" as default (forced — not in upstream list).`
          : `Saved "${r.default_model}" as default model.`,
      );
    } catch (e: any) {
      // Server returns a structured error message. If it's the "model not in
      // upstream list" case, offer a one-click force-save.
      const msg: string = e?.message || String(e);
      if (!force && /not.*found.*upstream|model_missing/i.test(msg)) {
        toast.error(msg, {
          action: {
            label: "Save anyway",
            onClick: () => persistDefaultModel(true),
          },
          duration: 8000,
        });
      } else if (/upstream_unreachable|upstream_error|parse_failed|empty_list/i.test(msg)) {
        toast.error(`Couldn't verify against upstream: ${msg}. Refresh the model list and try again.`);
      } else {
        toast.error(msg);
      }
    } finally {
      setSavingDefault(false);
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

  // -------- curl example builder --------
  // Builds copyable curl commands from the current form state for: GET /models
  // and POST chat (chat_completions or anthropic_messages). Auth is applied per
  // the selected scheme; the provider key is shown as a $PROVIDER_KEY shell var
  // so users never paste a real secret into their clipboard from this UI.
  const shQuote = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const joinUrl = (base: string, path: string) => {
    if (!path) return base;
    if (/^https?:\/\//i.test(path)) return path;
    const b = base.replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${b}${p}`;
  };
  const buildCurlExamples = () => {
    const base = form.base_url.trim();
    if (!base) return null;
    const scheme = form.auth_scheme || "bearer";
    const headerName = (form.auth_header || "").trim();
    const prefix = (form.path_prefix || "").replace(/\/+$/, "");
    const modelsPath = (form.models_path || "/models").trim();
    const chatPath = (form.chat_path || (form.kind === "anthropic" ? "/messages" : "/chat/completions")).trim();
    const modelsUrlBase = (form.models_url || "").trim() || joinUrl(base, `${prefix}${modelsPath.startsWith("/") ? "" : "/"}${modelsPath}`);
    const chatUrl = joinUrl(base, `${prefix}${chatPath.startsWith("/") ? "" : "/"}${chatPath}`);

    // Auth wiring
    const headerLines: string[] = [];
    let modelsUrlFinal = modelsUrlBase;
    let chatUrlFinal = chatUrl;
    if (scheme === "bearer") {
      headerLines.push(`-H ${shQuote(`Authorization: Bearer $PROVIDER_KEY`)}`);
    } else if (scheme === "x-api-key") {
      headerLines.push(`-H ${shQuote(`x-api-key: $PROVIDER_KEY`)}`);
    } else if (scheme === "header" && headerName) {
      headerLines.push(`-H ${shQuote(`${headerName}: $PROVIDER_KEY`)}`);
    } else if (scheme === "query" && headerName) {
      const sep = (u: string) => (u.includes("?") ? "&" : "?");
      modelsUrlFinal = `${modelsUrlBase}${sep(modelsUrlBase)}${headerName}=$PROVIDER_KEY`;
      chatUrlFinal = `${chatUrl}${sep(chatUrl)}${headerName}=$PROVIDER_KEY`;
    }

    // Anthropic typically requires an API version header
    if (form.kind === "anthropic" && !form.extra_headers.some((h) => h.key.toLowerCase() === "anthropic-version")) {
      headerLines.push(`-H ${shQuote(`anthropic-version: 2023-06-01`)}`);
    }
    for (const h of form.extra_headers) {
      if (h.key.trim()) headerLines.push(`-H ${shQuote(`${h.key.trim()}: ${h.value}`)}`);
    }

    const indent = " \\\n  ";
    const modelsCmd = [`curl -sS ${shQuote(modelsUrlFinal)}`, ...headerLines].join(indent);

    const model = form.default_model.trim() || "MODEL_ID";
    const isAnthropic = (form.response_format || (form.kind === "anthropic" ? "anthropic_messages" : "chat_completions")) === "anthropic_messages";
    const body = isAnthropic
      ? { model, max_tokens: 64, messages: [{ role: "user", content: "ping" }] }
      : { model, messages: [{ role: "user", content: "ping" }], max_tokens: 64 };
    const jsonBody = JSON.stringify(body);
    const chatCmd = [
      `curl -sS -X POST ${shQuote(chatUrlFinal)}`,
      ...headerLines,
      `-H ${shQuote("Content-Type: application/json")}`,
      `-d ${shQuote(jsonBody)}`,
    ].join(indent);

    return { modelsCmd, chatCmd, needsKey: scheme !== "none" };
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  };

  const endpoints = data?.endpoints ?? [];

  // -------- Export --------
  const [exporting, setExporting] = useState(false);
  const handleExport = async (includeKeys: "none" | "encrypted") => {
    setExporting(true);
    try {
      const r = await call<any>("export_endpoints", { body: { include_keys: includeKeys } });
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `anveguard-endpoints-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${r.count} endpoint${r.count === 1 ? "" : "s"}${includeKeys === "encrypted" ? " (with encrypted keys)" : ""}.`);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // -------- Import --------
  const [importOpen, setImportOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<any | null>(null);
  const [importStrategy, setImportStrategy] = useState<"skip" | "rename" | "overwrite">("rename");
  const [acceptKeys, setAcceptKeys] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useMemo(() => ({ current: null as HTMLInputElement | null }), []);

  const onPickFile = () => fileInputRef.current?.click();
  const onFileChosen = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.format && parsed.format !== "anveguard.endpoints") {
        toast.error(`Unexpected file format: ${parsed.format}`);
        return;
      }
      if (!Array.isArray(parsed?.endpoints)) {
        toast.error("File doesn't contain an 'endpoints' array.");
        return;
      }
      setImportPayload(parsed);
      setImportOpen(true);
    } catch (e: any) {
      toast.error(`Couldn't read file: ${e.message || e}`);
    }
  };

  const runImport = async () => {
    if (!importPayload) return;
    setImporting(true);
    try {
      const r = await call<{ imported: number; updated: number; skipped: number; errors: any[] }>(
        "import_endpoints",
        { body: { payload: importPayload, strategy: importStrategy, accept_encrypted_keys: acceptKeys } },
      );
      const parts: string[] = [];
      if (r.imported) parts.push(`${r.imported} imported`);
      if (r.updated) parts.push(`${r.updated} updated`);
      if (r.skipped) parts.push(`${r.skipped} skipped`);
      const summary = parts.join(", ") || "No changes";
      if (r.errors?.length) {
        toast.error(`${summary} · ${r.errors.length} error(s): ${r.errors[0]?.error ?? ""}`);
      } else {
        toast.success(summary);
      }
      qc.invalidateQueries({ queryKey: ["endpoints"] });
      setImportOpen(false);
      setImportPayload(null);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Custom Endpoints</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Save self-hosted or third-party LLM endpoints once and reuse them across API keys.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={(el) => { fileInputRef.current = el; }}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onFileChosen(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={onPickFile} disabled={importing}>
            <Upload className="h-4 w-4 mr-2" /> Import
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting || endpoints.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={() => handleExport("none")}>
                <div>
                  <div className="font-medium">Without provider keys</div>
                  <div className="text-xs text-muted-foreground">Safe to share. Keys must be re-entered after import.</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport("encrypted")}>
                <div>
                  <div className="font-medium">With encrypted keys</div>
                  <div className="text-xs text-muted-foreground">Only restorable on this same project (server-side secret).</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            onClick={startCreate}
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" /> New endpoint
          </Button>
        </div>
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
              <div className="space-y-2">
                <Label>Template (optional)</Label>
                {/* Selecting a template only stages a preview — nothing is written
                    to the form until the user clicks "Apply changes" below. */}
                <Select value={previewTemplateId} onValueChange={setPreviewTemplateId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Pick a provider to preview which fields will change…" />
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

                {/* Live diff preview — shown only while a template is staged */}
                {previewDiff && (
                  <div className="rounded-md border bg-muted/20">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{previewDiff.template.label}</span>
                        <span className="text-muted-foreground">
                          {changedCount === 0
                            ? "No changes — your form already matches this template."
                            : `${changedCount} field${changedCount === 1 ? "" : "s"} will change`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => setPreviewTemplateId("")}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button" size="sm" className="h-7 px-2 text-xs"
                          disabled={changedCount === 0}
                          onClick={() => applyTemplate(previewTemplateId)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Apply changes
                        </Button>
                      </div>
                    </div>
                    <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                      {previewDiff.rows.map((r) => (
                        <li key={r.field as string} className="px-3 py-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                                r.status === "change"
                                  ? "border-primary/40 text-primary"
                                  : r.status === "add"
                                    ? "border-accent/40 text-accent-foreground bg-accent/20"
                                    : "border-border text-muted-foreground"
                              }`}
                            >
                              {r.status}
                            </Badge>
                            <span className="font-medium">{r.label}</span>
                          </div>
                          {r.status === "unchanged" ? (
                            <div className="mt-0.5 ml-12 font-mono text-muted-foreground break-all">
                              {r.current || <span className="italic">(empty)</span>}
                            </div>
                          ) : (
                            <div className="mt-0.5 ml-12 space-y-0.5 font-mono">
                              {r.status === "change" && (
                                <div className="flex gap-1.5">
                                  <span className="text-muted-foreground shrink-0">−</span>
                                  <span className="line-through text-muted-foreground break-all">
                                    {r.current || <span className="italic no-underline">(empty)</span>}
                                  </span>
                                </div>
                              )}
                              <div className="flex gap-1.5">
                                <span className="text-primary shrink-0">+</span>
                                <span className="text-foreground break-all">
                                  {r.next || <span className="italic text-muted-foreground">(empty)</span>}
                                </span>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {form.template && !previewTemplateId && (
                  <p className="text-[11px] text-muted-foreground">
                    Last applied: <span className="font-medium">{form.template}</span> — pick another template above to preview a different one.
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
                {(() => {
                  const chosen = form.default_model.trim();
                  const dirty = isEdit && chosen !== savedDefaultModel;
                  const inLive = !!liveModels && liveModels.includes(chosen);
                  // Only allow persisting after a successful live refresh in this session.
                  const canPersist = isEdit && lastRefreshOk && !!chosen && dirty && !savingDefault;
                  let hint: { tone: "ok" | "warn" | "muted"; text: string } | null = null;
                  if (isEdit) {
                    if (!lastRefreshOk) {
                      hint = { tone: "muted", text: "Refresh upstream models to enable saving." };
                    } else if (!chosen) {
                      hint = { tone: "muted", text: "Pick a model to enable saving." };
                    } else if (!dirty) {
                      hint = { tone: "ok", text: "Saved." };
                    } else if (!inLive) {
                      hint = { tone: "warn", text: "Not in upstream list — save will be rejected unless forced." };
                    } else {
                      hint = { tone: "ok", text: "Verified against upstream — ready to save." };
                    }
                  }
                  return (
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs">Default model</Label>
                      {isEdit && (
                        <div className="flex items-center gap-2">
                          {hint && (
                            <span className={`text-[11px] ${
                              hint.tone === "ok" ? "text-primary"
                                : hint.tone === "warn" ? "text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground"
                            }`}>{hint.text}</span>
                          )}
                          <Button
                            type="button" size="sm" variant="outline"
                            className="h-7 text-xs"
                            disabled={!canPersist}
                            onClick={() => persistDefaultModel(false)}
                            title={
                              !lastRefreshOk
                                ? "Refresh upstream models first"
                                : !dirty
                                  ? "No changes to save"
                                  : "Save default model"
                            }
                          >
                            {savingDefault
                              ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                              : <Save className="h-3.5 w-3.5 mr-1" />}
                            Save as default
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {liveModels && liveModels.length > 0 ? (() => {
                  const q = modelFilter.trim().toLowerCase();
                  const filtered = q
                    ? liveModels.filter((m) => m.toLowerCase().includes(q))
                    : liveModels;
                  return (
                    <div className="space-y-2 mt-1">
                      {liveModels.length > 6 && (
                        <div className="relative">
                          <Input
                            value={modelFilter}
                            onChange={(e) => setModelFilter(e.target.value)}
                            placeholder={`Search ${liveModels.length} models…`}
                            className="font-mono text-xs pr-7"
                          />
                          {modelFilter && (
                            <button
                              type="button"
                              onClick={() => setModelFilter("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              aria-label="Clear search"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Select
                          value={filtered.includes(form.default_model) ? form.default_model : ""}
                          onValueChange={(v) => setForm({ ...form, default_model: v })}
                        >
                          <SelectTrigger className="font-mono text-xs">
                            <SelectValue
                              placeholder={
                                filtered.length === 0
                                  ? "No matches"
                                  : q
                                    ? `Pick from ${filtered.length} of ${liveModels.length}…`
                                    : "Pick from live list…"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {filtered.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                No models match "{modelFilter}"
                              </div>
                            ) : (
                              filtered.map((m) => (
                                <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <Input
                          value={form.default_model}
                          onChange={(e) => setForm({ ...form, default_model: e.target.value })}
                          placeholder="or type manually"
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  );
                })() : (
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
              {/* Validation summary — visible whenever required fields are missing
                  or malformed. Both Test and Save are disabled until cleared. */}
              {!validation.success && errorEntries.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-destructive mb-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Fix {errorEntries.length} field{errorEntries.length === 1 ? "" : "s"} before testing or saving
                  </div>
                  <ul className="ml-5 list-disc space-y-0.5 text-foreground/90">
                    {errorEntries.map(([field, msg]) => (
                      <li key={field}>
                        <span className="font-medium">{FIELD_LABELS[field]}:</span> {msg}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={test}
                  disabled={testing || !canTest}
                  title={!canTest ? "Resolve validation errors above to enable testing" : undefined}
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

            {/* Copyable curl examples — generated from the current form state */}
            {(() => {
              const ex = buildCurlExamples();
              if (!ex) return null;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">curl examples</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {ex.needsKey ? "Set $PROVIDER_KEY in your shell first" : "No auth required"}
                    </span>
                  </div>
                  {ex.needsKey && (
                    <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground">
                      export PROVIDER_KEY='your-key-here'
                    </div>
                  )}
                  {[
                    { label: "List models", cmd: ex.modelsCmd },
                    { label: form.kind === "anthropic" ? "Send a message" : "Chat completion", cmd: ex.chatCmd },
                  ].map((c) => (
                    <div key={c.label} className="rounded-md border bg-muted/20">
                      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/60">
                        <span className="text-xs font-medium">{c.label}</span>
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => copyToClipboard(c.cmd, c.label)}
                        >
                          Copy
                        </Button>
                      </div>
                      <pre className="px-2.5 py-2 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre text-foreground/90">{c.cmd}</pre>
                    </div>
                  ))}
                </div>
              );
            })()}
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

      {/* Import preview dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportPayload(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Import endpoints
            </DialogTitle>
          </DialogHeader>

          {importPayload && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Endpoints in file</span>
                  <span className="font-medium">{importPayload.endpoints?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Format</span>
                  <code className="text-xs">{importPayload.format ?? "—"} v{importPayload.version ?? 1}</code>
                </div>
                {importPayload.exported_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exported</span>
                    <span className="text-xs">{new Date(importPayload.exported_at).toLocaleString()}</span>
                  </div>
                )}
                {importPayload.endpoints?.some((e: any) => e.provider_key_encrypted) && (
                  <div className="flex items-start gap-2 mt-2 text-xs text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>This file contains encrypted provider keys. They will only restore on this same project.</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>On name conflict</Label>
                <Select value={importStrategy} onValueChange={(v: any) => setImportStrategy(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rename">Import as new (append "(imported)")</SelectItem>
                    <SelectItem value="skip">Skip existing endpoints</SelectItem>
                    <SelectItem value="overwrite">Overwrite existing endpoints</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {importPayload.endpoints?.some((e: any) => e.provider_key_encrypted) && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 mt-0.5 accent-primary"
                    checked={acceptKeys}
                    onChange={(e) => setAcceptKeys(e.target.checked)}
                  />
                  <span>Restore encrypted provider keys from this file (only works on the project that exported them).</span>
                </label>
              )}

              <div className="rounded-md border p-2 max-h-40 overflow-y-auto space-y-1">
                {(importPayload.endpoints ?? []).slice(0, 30).map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Plug className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{e.name || "(unnamed)"}</span>
                    <code className="text-muted-foreground truncate">{e.base_url}</code>
                    {e.provider_key_encrypted && <KeyRound className="h-3 w-3 text-primary ml-auto shrink-0" />}
                  </div>
                ))}
                {(importPayload.endpoints?.length ?? 0) > 30 && (
                  <div className="text-[11px] text-muted-foreground pt-1">
                    + {importPayload.endpoints.length - 30} more…
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setImportOpen(false); setImportPayload(null); }}>Cancel</Button>
            <Button onClick={runImport} disabled={importing || !importPayload}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function StatTile({
  label, value, hint, tone,
}: { label: string; value: ReactNode; hint?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-md border p-3 ${tone === "warn" ? "border-destructive/30 bg-destructive/5" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export default Endpoints;
