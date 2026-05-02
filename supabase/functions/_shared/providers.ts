// Single source of truth for upstream LLM providers AnveGuard can proxy to.

export type ProviderKind = "openai_compatible" | "anthropic";

export interface ProviderDef {
  id: string;
  label: string;
  kind: ProviderKind;
  url: string;
  /** GET endpoint that returns available models. Omit for managed providers w/o one. */
  models_url?: string;
  /** If true, no user-provided key is required (server uses LOVABLE_API_KEY). */
  managed?: boolean;
  default_model: string;
  model_suggestions: string[];
  key_placeholder: string;
  get_key_url: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "lovable",
    label: "Lovable AI (managed)",
    kind: "openai_compatible",
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    managed: true,
    default_model: "google/gemini-3-flash-preview",
    model_suggestions: [
      "google/gemini-3-flash-preview",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
      "openai/gpt-5",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
    ],
    key_placeholder: "",
    get_key_url: "https://docs.lovable.dev/features/ai",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai_compatible",
    url: "https://api.openai.com/v1/chat/completions",
    models_url: "https://api.openai.com/v1/models",
    default_model: "gpt-4o-mini",
    model_suggestions: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"],
    key_placeholder: "sk-...",
    get_key_url: "https://platform.openai.com/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai_compatible",
    url: "https://openrouter.ai/api/v1/chat/completions",
    models_url: "https://openrouter.ai/api/v1/models",
    default_model: "openrouter/auto",
    model_suggestions: [
      "openrouter/auto",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o-mini",
      "meta-llama/llama-3.1-70b-instruct",
    ],
    key_placeholder: "sk-or-...",
    get_key_url: "https://openrouter.ai/keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    models_url: "https://api.anthropic.com/v1/models",
    default_model: "claude-sonnet-4-5",
    model_suggestions: [
      "claude-opus-4-6",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-opus-4-5",
    ],
    key_placeholder: "sk-ant-...",
    get_key_url: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "perplexity",
    label: "Perplexity (Sonar)",
    kind: "openai_compatible",
    url: "https://api.perplexity.ai/chat/completions",
    models_url: "https://api.perplexity.ai/v1/models",
    default_model: "sonar",
    model_suggestions: ["sonar", "sonar-pro", "sonar-reasoning-pro", "sonar-deep-research"],
    key_placeholder: "pplx-...",
    get_key_url: "https://www.perplexity.ai/settings/api",
  },
  {
    id: "kimi",
    label: "Moonshot Kimi",
    kind: "openai_compatible",
    url: "https://api.moonshot.ai/v1/chat/completions",
    models_url: "https://api.moonshot.ai/v1/models",
    default_model: "kimi-k2-turbo-preview",
    model_suggestions: [
      "kimi-k2-turbo-preview",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
      "moonshot-v1-auto",
    ],
    key_placeholder: "sk-...",
    get_key_url: "https://platform.moonshot.ai/console/api-keys",
  },
  {
    id: "qwen",
    label: "Alibaba Qwen (DashScope)",
    kind: "openai_compatible",
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    models_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
    default_model: "qwen-plus",
    model_suggestions: ["qwen-plus", "qwen-max", "qwen-flash", "qwen-turbo"],
    key_placeholder: "sk-...",
    get_key_url: "https://dashscope.console.aliyun.com/apiKey",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    kind: "openai_compatible", // overridden per-key by custom_kind
    url: "", // resolved per-key from custom_base_url
    default_model: "",
    model_suggestions: [],
    key_placeholder: "your provider key (or leave blank)",
    get_key_url: "https://platform.openai.com/docs/api-reference/chat",
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// =====================================================================
// Custom endpoint support
// =====================================================================

export type AuthScheme = "bearer" | "header" | "x-api-key" | "query" | "none";

export interface CustomEndpointInput {
  base_url: string;
  models_url?: string | null;
  kind: ProviderKind;
  auth_scheme: AuthScheme;
  auth_header?: string | null;
  extra_headers?: Record<string, string> | null;
}

export interface ResolvedEndpoint {
  url: string;
  models_url: string;
  kind: ProviderKind;
  /** Base headers minus auth (auth is applied by the proxy with the decrypted upstream key). */
  extra_headers: Record<string, string>;
  auth_scheme: AuthScheme;
  auth_header: string;
}

/** Provider-form choices we expose to the UI so it stays data-driven. */
export const CUSTOM_SCHEMA = {
  kinds: [
    { id: "openai_compatible", label: "OpenAI-compatible (/v1/chat/completions)" },
    { id: "anthropic", label: "Anthropic-compatible (/v1/messages)" },
  ],
  auth_schemes: [
    { id: "bearer", label: "Bearer token (Authorization: Bearer …)" },
    { id: "header", label: "Custom header" },
    { id: "x-api-key", label: "x-api-key header" },
    { id: "query", label: "Query parameter (e.g. ?key=…)" },
    { id: "none", label: "No auth (e.g. local Ollama)" },
  ],
  templates: [
    {
      id: "ollama",
      label: "Ollama (local)",
      values: {
        kind: "openai_compatible", base_url: "http://localhost:11434/v1",
        auth_scheme: "none", default_model: "llama3.1",
        model_suggestions: "llama3.1, qwen2.5, gpt-oss:20b",
      },
    },
    {
      id: "vllm",
      label: "vLLM / LM Studio",
      values: {
        kind: "openai_compatible", base_url: "http://localhost:8000/v1",
        auth_scheme: "bearer", default_model: "",
        model_suggestions: "",
      },
    },
    {
      id: "azure",
      label: "Azure OpenAI",
      values: {
        kind: "openai_compatible",
        base_url: "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
        auth_scheme: "header", auth_header: "api-key",
        default_model: "gpt-4o-mini", model_suggestions: "gpt-4o-mini, gpt-4o",
      },
    },
    {
      id: "groq",
      label: "Groq",
      values: {
        kind: "openai_compatible", base_url: "https://api.groq.com/openai/v1",
        auth_scheme: "bearer", default_model: "llama-3.3-70b-versatile",
        model_suggestions: "llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768",
      },
    },
    {
      id: "together",
      label: "Together AI",
      values: {
        kind: "openai_compatible", base_url: "https://api.together.xyz/v1",
        auth_scheme: "bearer", default_model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        model_suggestions: "",
      },
    },
    {
      id: "fireworks",
      label: "Fireworks",
      values: {
        kind: "openai_compatible", base_url: "https://api.fireworks.ai/inference/v1",
        auth_scheme: "bearer", default_model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
        model_suggestions: "",
      },
    },
    {
      id: "xai",
      label: "xAI Grok",
      values: {
        kind: "openai_compatible", base_url: "https://api.x.ai/v1",
        auth_scheme: "bearer", default_model: "grok-2-latest",
        model_suggestions: "grok-2-latest, grok-2-mini",
      },
    },
    {
      id: "mistral",
      label: "Mistral",
      values: {
        kind: "openai_compatible", base_url: "https://api.mistral.ai/v1",
        auth_scheme: "bearer", default_model: "mistral-large-latest",
        model_suggestions: "mistral-large-latest, mistral-small-latest, codestral-latest",
      },
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      values: {
        kind: "openai_compatible", base_url: "https://api.deepseek.com/v1",
        auth_scheme: "bearer", default_model: "deepseek-chat",
        model_suggestions: "deepseek-chat, deepseek-reasoner",
      },
    },
    {
      id: "anthropic_compat",
      label: "Anthropic-compatible proxy",
      values: {
        kind: "anthropic", base_url: "https://my-anthropic-proxy.example.com/v1",
        auth_scheme: "x-api-key", default_model: "claude-sonnet-4-5",
        model_suggestions: "",
      },
    },
  ],
};

const RESERVED_HEADERS = new Set([
  "authorization", "x-api-key", "content-type", "host",
]);

/** Sanitize user-supplied extra headers (drops reserved + empty + non-string). */
export function sanitizeExtraHeaders(
  input: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const [rawK, rawV] of Object.entries(input)) {
    if (typeof rawK !== "string" || typeof rawV !== "string") continue;
    const k = rawK.trim();
    const v = rawV.trim();
    if (!k || !v) continue;
    if (RESERVED_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.+\.local)$/i;

const BLOCKED_HOSTS = new Set([
  "169.254.169.254",          // AWS/GCP/Azure IMDS
  "metadata.google.internal", // GCE metadata
  "metadata",                  // alt GCE metadata alias
]);

/** Validate a user-supplied custom URL. Throws Error with a user-facing message. */
export function validateCustomUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("URL must use http or https");
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new Error("This host is not allowed");
  }
  if (u.protocol === "http:" && !PRIVATE_HOST_RE.test(host)) {
    throw new Error("Plain http:// is only allowed for localhost / private networks. Use https:// for public endpoints.");
  }
  return u;
}

/** Append a path to a base URL, preserving the original query string. */
function appendPath(baseRaw: string, ensureSuffix: string): string {
  const u = new URL(baseRaw);
  // Trim trailing slashes from path
  let path = u.pathname.replace(/\/+$/, "");
  if (!path.endsWith(ensureSuffix)) path += ensureSuffix;
  u.pathname = path;
  return u.toString();
}

/** Replace the trailing path segment (e.g. /chat/completions -> /models). */
function withFinalSegment(baseRaw: string, finalSegment: string): string {
  const u = new URL(baseRaw);
  let path = u.pathname.replace(/\/+$/, "");
  // Strip a trailing chat/completions or messages so we land on /v1
  path = path.replace(/\/(chat\/completions|messages)$/, "");
  if (!path.endsWith(finalSegment)) path += finalSegment;
  u.pathname = path;
  return u.toString();
}

/**
 * Resolve a custom endpoint into a concrete URL + headers + kind.
 * Pass the raw values from the api_keys row.
 */
export function resolveCustomEndpoint(input: CustomEndpointInput): ResolvedEndpoint {
  const u = validateCustomUrl(input.base_url);
  const kind: ProviderKind = input.kind === "anthropic" ? "anthropic" : "openai_compatible";
  const chatSuffix = kind === "anthropic" ? "/messages" : "/chat/completions";
  const url = appendPath(u.toString(), chatSuffix);
  const models_url = input.models_url
    ? validateCustomUrl(input.models_url).toString()
    : withFinalSegment(u.toString(), "/models");

  const auth_scheme: AuthScheme = (["bearer", "header", "x-api-key", "query", "none"] as AuthScheme[])
    .includes(input.auth_scheme) ? input.auth_scheme : "bearer";

  // For query auth the auth_header field is repurposed as the param name (default "key").
  const defaultHeader = auth_scheme === "query" ? "key" : "Authorization";

  return {
    url,
    models_url,
    kind,
    extra_headers: sanitizeExtraHeaders(input.extra_headers),
    auth_scheme,
    auth_header: (input.auth_header || defaultHeader).trim(),
  };
}

/** Append `?name=value` (or `&`) to a URL, preserving existing query. */
function withQueryParam(raw: string, name: string, value: string): string {
  const u = new URL(raw);
  u.searchParams.set(name, value);
  return u.toString();
}

/**
 * Resolve forward URL + complete headers (including auth) for either built-in
 * or custom providers. `keyRow` is a row from api_keys.
 */
export function resolveEndpoint(keyRow: {
  provider: string;
  custom_base_url?: string | null;
  custom_models_url?: string | null;
  custom_kind?: string | null;
  custom_auth_scheme?: string | null;
  custom_auth_header?: string | null;
  custom_extra_headers?: Record<string, string> | null;
}, upstreamKey: string | null): {
  url: string;
  models_url?: string;
  kind: ProviderKind;
  /** Headers ready to send (auth already applied where applicable). */
  headers: Record<string, string>;
} {
  if (keyRow.provider === "custom") {
    const r = resolveCustomEndpoint({
      base_url: keyRow.custom_base_url ?? "",
      models_url: keyRow.custom_models_url ?? null,
      kind: (keyRow.custom_kind as ProviderKind) ?? "openai_compatible",
      auth_scheme: (keyRow.custom_auth_scheme as AuthScheme) ?? "bearer",
      auth_header: keyRow.custom_auth_header ?? null,
      extra_headers: keyRow.custom_extra_headers ?? null,
    });
    const headers: Record<string, string> = { ...r.extra_headers };
    let url = r.url;
    let models_url = r.models_url;
    if (upstreamKey && r.auth_scheme !== "none") {
      if (r.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${upstreamKey}`;
      else if (r.auth_scheme === "x-api-key") headers["x-api-key"] = upstreamKey;
      else if (r.auth_scheme === "header") headers[r.auth_header] = upstreamKey;
      else if (r.auth_scheme === "query") {
        url = withQueryParam(url, r.auth_header, upstreamKey);
        models_url = withQueryParam(models_url, r.auth_header, upstreamKey);
      }
    }
    if (r.kind === "anthropic" && !headers["anthropic-version"]) {
      headers["anthropic-version"] = "2023-06-01";
    }
    return { url, models_url, kind: r.kind, headers };
  }

  const def = getProvider(keyRow.provider);
  if (!def) throw new Error(`Unknown provider: ${keyRow.provider}`);
  const headers: Record<string, string> = {};
  if (def.kind === "anthropic") {
    if (upstreamKey) headers["x-api-key"] = upstreamKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (upstreamKey) {
    headers["Authorization"] = `Bearer ${upstreamKey}`;
  }
  if (def.id === "openrouter") {
    headers["HTTP-Referer"] = "https://anveguard.app";
    headers["X-Title"] = "AnveGuard";
  }
  return { url: def.url, models_url: def.models_url, kind: def.kind, headers };
}
