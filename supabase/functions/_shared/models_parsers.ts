// Provider-aware parsing of "list models" responses.
//
// Different providers return very different shapes from their /models (or
// equivalent) endpoint. This module normalizes them into a single
// `ParsedModels` shape so the dashboard can populate dropdowns consistently.
//
// Supported shapes (best-effort, in priority order):
//   - OpenAI / OpenAI-compatible:  { object: "list", data: [{ id, ... }] }
//   - vLLM:                        { object: "list", data: [{ id, root, ... }] } (same as OpenAI)
//   - Groq / Together / Fireworks: { data: [{ id, owned_by, context_window, ... }] }
//   - OpenRouter:                  { data: [{ id, name, context_length, pricing, ... }] }
//   - Anthropic:                   { data: [{ id: "claude-...", display_name, type: "model" }], has_more, first_id, last_id }
//   - Ollama:                      { models: [{ name: "llama3:8b", model, size, modified_at, details: { ... } }] }
//   - Ollama tags (alt):           { models: [{ name, modified_at, size }] } (same path)
//   - LM Studio / llama.cpp:       { data: [{ id }] } or sometimes top-level array
//   - Bare array:                  [ "model-a", { id: "model-b" }, ... ]
//   - Single-key wrappers:         { models: [...] } | { model_list: [...] } | { result: [...] }
//
// We never throw on unexpected shapes — we return an empty `models` list and
// the caller can fall back to manual suggestions.

export type ProviderShape =
  | "openai"
  | "anthropic"
  | "ollama"
  | "openrouter"
  | "bare_array"
  | "string_array"
  | "wrapped_array"
  | "unknown";

export interface ParsedModel {
  id: string;
  display_name?: string | null;
  context_window?: number | null;
  owned_by?: string | null;
}

export interface ParsedModels {
  shape: ProviderShape;
  models: ParsedModel[];
  ids: string[];           // unique, in original order
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function pickArray(j: any): { arr: any[]; key: string | null } {
  if (Array.isArray(j)) return { arr: j, key: null };
  if (!j || typeof j !== "object") return { arr: [], key: null };
  // Common wrappers, in priority order. `data` first because it is the
  // OpenAI-spec field and is also used by Anthropic/Groq/Together/etc.
  for (const k of ["data", "models", "model_list", "result", "results", "items"]) {
    if (Array.isArray(j[k])) return { arr: j[k], key: k };
  }
  return { arr: [], key: null };
}

function detectShape(j: any, key: string | null, arr: any[]): ProviderShape {
  if (Array.isArray(j)) {
    return arr.length > 0 && typeof arr[0] === "string" ? "string_array" : "bare_array";
  }
  if (key === "models") {
    // Ollama uses { models: [{ name, modified_at, ... }] }
    if (arr.some((m: any) => m && typeof m === "object" && "name" in m && !("id" in m))) {
      return "ollama";
    }
    return "wrapped_array";
  }
  if (key === "data") {
    // Anthropic uses `type: "model"` markers and pagination cursors.
    if (j && (typeof j.first_id === "string" || arr.some((m: any) => m?.type === "model"))) {
      return "anthropic";
    }
    // OpenRouter ships pricing + context_length on each item.
    if (arr.some((m: any) => m && typeof m === "object" && ("pricing" in m || "context_length" in m))) {
      return "openrouter";
    }
    return "openai";
  }
  return key ? "wrapped_array" : "unknown";
}

function normalizeOne(m: any, shape: ProviderShape): ParsedModel | null {
  if (typeof m === "string") return m ? { id: m } : null;
  if (!m || typeof m !== "object") return null;

  // Ollama: identifier lives in `name` (e.g. "llama3:8b"), `model` is a duplicate.
  if (shape === "ollama") {
    const id = isStr(m.name) ? m.name : (isStr(m.model) ? m.model : null);
    if (!id) return null;
    return {
      id,
      display_name: isStr(m.details?.family) ? `${m.details.family}${m.details?.parameter_size ? ` · ${m.details.parameter_size}` : ""}` : null,
      context_window: num(m.details?.context_length) ?? null,
    };
  }

  // Anthropic: { id: "claude-...", display_name, type: "model" }
  if (shape === "anthropic") {
    const id = isStr(m.id) ? m.id : null;
    if (!id) return null;
    return { id, display_name: isStr(m.display_name) ? m.display_name : null };
  }

  // OpenRouter: rich metadata
  if (shape === "openrouter") {
    const id = isStr(m.id) ? m.id : null;
    if (!id) return null;
    return {
      id,
      display_name: isStr(m.name) ? m.name : null,
      context_window: num(m.context_length) ?? num(m.context_window) ?? null,
    };
  }

  // OpenAI / vLLM / Groq / Together / Fireworks / generic OpenAI-compatible
  const id = isStr(m.id) ? m.id : (isStr(m.name) ? m.name : (isStr(m.model) ? m.model : null));
  if (!id) return null;
  return {
    id,
    display_name: isStr(m.name) && m.name !== id ? m.name : null,
    owned_by: isStr(m.owned_by) ? m.owned_by : (isStr(m.organization) ? m.organization : null),
    context_window: num(m.context_window) ?? num(m.context_length) ?? num(m.max_context_length) ?? null,
  };
}

/**
 * Parse a JSON body returned by an upstream "list models" endpoint and
 * return a normalized `{ shape, models, ids }` triple.
 *
 * `hint` lets the caller bias detection when the endpoint kind is known
 * (e.g. an Anthropic endpoint whose `/v1/models` response would otherwise
 * look generic). Auto-detection still runs and wins if the payload is
 * unambiguous.
 */
export function parseModelsResponse(j: any, hint?: "openai" | "anthropic" | "ollama" | null): ParsedModels {
  const { arr, key } = pickArray(j);
  let shape = detectShape(j, key, arr);
  if (hint === "anthropic" && shape === "openai") shape = "anthropic";
  if (hint === "ollama" && shape !== "ollama" && key === "models") shape = "ollama";

  const seen = new Set<string>();
  const models: ParsedModel[] = [];
  const ids: string[] = [];
  for (const item of arr) {
    const norm = normalizeOne(item, shape);
    if (!norm) continue;
    if (seen.has(norm.id)) continue;
    seen.add(norm.id);
    models.push(norm);
    ids.push(norm.id);
  }
  return { shape, models, ids };
}
