// AnveGuard proxy — OpenAI-compatible /v1/chat/completions endpoint.
// Public function; authenticated via AnveGuard API keys (Authorization: Bearer ag_live_...).
import { corsHeaders, json, service, sha256Hex, decryptString } from "../_shared/anveguard.ts";
import { getProvider, resolveEndpoint } from "../_shared/providers.ts";
import { openaiToAnthropicRequest, anthropicToOpenAIResponse,
  anthropicStreamToOpenAI } from "../_shared/anthropic.ts";
import { chatToResponsesRequest, responsesToChatResponse,
  responsesStreamToChat } from "../_shared/responses_api.ts";
import {
  evaluate as evaluatePolicy, DEFAULT_SETTINGS,
  evaluateInjection, applySanitization,
  type PolicyRule, type PolicyIntent, type PolicySettings, type EvaluateResult,
} from "../_shared/policy_engine.ts";
import {
  detectRequestShape, translateRequestToOpenAI, translateResponseFromOpenAI,
  type RequestShape,
} from "../_shared/shape_translators.ts";

// ---- Error envelope helpers ------------------------------------------------
// Every error response goes through `errorResponse` so the public shape is
// consistent regardless of which SDK called us. The OpenAI shape follows the
// official spec:
//   { "error": { "message": str, "type": str, "param": str|null, "code": str|null } }
// `type` describes the error class (invalid_request_error, authentication_error,
// permission_error, rate_limit_exceeded, api_error). `code` is a stable machine
// identifier (invalid_api_key, missing_messages, content_filter, …) that
// clients can switch on without parsing prose.

type ErrorOpts = {
  /** Stable machine code (e.g. "invalid_api_key", "content_filter"). */
  code?: string | null;
  /** Request param the error refers to (e.g. "messages", "model"). */
  param?: string | null;
  /** Extra response headers (e.g. Retry-After on 429). */
  headers?: Record<string, string>;
  /** Vendor-specific debug info echoed back under the `anveguard` key. */
  anveguard?: Record<string, unknown>;
};

/** Pick the OpenAI `type` that best matches an HTTP status. */
function typeForStatus(status: number): string {
  if (status === 401 || status === 403) return status === 403 ? "permission_error" : "authentication_error";
  if (status === 404) return "invalid_request_error";
  if (status === 408 || status === 504) return "api_error";
  if (status === 429) return "rate_limit_exceeded";
  if (status >= 400 && status < 500) return "invalid_request_error";
  return "api_error";
}

function openaiErrorShape(message: string, type: string, opts: ErrorOpts = {}) {
  return {
    error: {
      message,
      type,
      param: opts.param ?? null,
      code: opts.code ?? null,
    },
  };
}

/** Translate the OpenAI-shape error envelope into the public shape. */
function errorForShape(shape: RequestShape, status: number, message: string, opts: ErrorOpts = {}): unknown {
  const type = typeForStatus(status);
  if (shape === "anthropic") {
    return { type: "error", error: { type: opts.code ?? type, message } };
  }
  if (shape === "gemini") {
    return { error: { code: status, status: opts.code ?? type, message } };
  }
  const env = openaiErrorShape(message, type, opts);
  if (opts.anveguard) (env as any).anveguard = opts.anveguard;
  return env;
}

/** Build a Response with the right body, status, headers, and CORS. */
function errorResponse(
  shape: RequestShape, status: number, message: string, opts: ErrorOpts = {},
): Response {
  return json(errorForShape(shape, status, message, opts), status, opts.headers);
}

/**
 * Load all policy state for a workspace in one round trip.
 * Falls back to safe defaults if rows are missing.
 */
async function loadWorkspacePolicy(sb: any, userId: string): Promise<{
  legacy: { blocked_keywords: string[]; allowed_keywords: string[]; use_global_defaults: boolean };
  rules: PolicyRule[];
  intents: PolicyIntent[];
  settings: PolicySettings;
  blockMessage: string;
}> {
  const [legacyRes, settingsRes, rulesRes, intentsRes] = await Promise.all([
    sb.from("policies").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("policy_rules").select("*").eq("user_id", userId).eq("enabled", true),
    sb.from("policy_intents").select("*").eq("user_id", userId),
  ]);
  return {
    legacy: {
      blocked_keywords: legacyRes.data?.blocked_keywords ?? [],
      allowed_keywords: legacyRes.data?.allowed_keywords ?? [],
      use_global_defaults: legacyRes.data?.use_global_defaults !== false,
    },
    rules: (rulesRes.data ?? []) as PolicyRule[],
    intents: (intentsRes.data ?? []) as PolicyIntent[],
    settings: settingsRes.data ?? DEFAULT_SETTINGS,
    blockMessage: legacyRes.data?.block_message || "This request was blocked by your organization's AI policy.",
  };
}

/** Pull the first system-role message text out of an OpenAI-shape body. */
function extractSystemPrompt(messages: any[]): string | undefined {
  const sys = messages.find((m) => m?.role === "system");
  if (!sys) return undefined;
  return typeof sys.content === "string" ? sys.content : JSON.stringify(sys.content ?? "");
}

/**
 * Run the output direction of the layered evaluator and turn its verdict into
 * the (status, block_reason, verdict_layers) tuple the request log expects.
 */
async function evaluateOutput(
  text: string,
  policyState: Awaited<ReturnType<typeof loadWorkspacePolicy>>,
  ctx: { systemPrompt?: string; toolsRequested?: boolean },
): Promise<{ status: "allowed" | "blocked_output"; blockReason: string | null; layers: any[] }> {
  if (!text) return { status: "allowed", blockReason: null, layers: [] };
  const r = await evaluatePolicy(
    {
      text,
      direction: "output",
      legacy: policyState.legacy,
      rules: policyState.rules,
      intents: policyState.intents,
      settings: policyState.settings,
    },
    ctx,
  );
  if (r.verdict === "block") {
    const reason = r.layers.find((l) => l.verdict === "block")?.reason ?? "Output blocked by policy";
    return { status: "blocked_output", blockReason: reason, layers: r.layers };
  }
  return { status: "allowed", blockReason: null, layers: r.layers };
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json(openaiErrorShape("Method not allowed. Use POST.", typeForStatus(405), { code: "method_not_allowed" }), 405, { Allow: "POST, OPTIONS" });
  }

  const start = Date.now();
  const sb = service();

  // Detect the public request shape from the URL path so the same proxy
  // can serve OpenAI, Anthropic, and Gemini SDKs unchanged.
  const reqUrl = new URL(req.url);
  const route = detectRequestShape(reqUrl);
  const reqShape: RequestShape = route.shape;

  // ---- Auth: accept the AnveGuard key in whatever header the SDK sends.
  //   - OpenAI / generic:    Authorization: Bearer ag_live_…
  //   - Anthropic SDK:       x-api-key: ag_live_…
  //   - Google Gemini SDK:   ?key=ag_live_…
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const xApiKey = req.headers.get("x-api-key") || req.headers.get("X-API-Key") || "";
  const queryKey = reqUrl.searchParams.get("key") || "";
  const bearer = authHeader.match(/^Bearer\s+(ag_live_\S+)/i)?.[1];
  const apiKeyPlain = bearer
    || (xApiKey.startsWith("ag_live_") ? xApiKey : "")
    || (queryKey.startsWith("ag_live_") ? queryKey : "");
  if (!apiKeyPlain) {
    return json(errorForShape(reqShape, "Missing or invalid AnveGuard API key", "invalid_request_error"), 401);
  }
  const key_hash = await sha256Hex(apiKeyPlain);

  const { data: keyRow } = await sb.from("api_keys")
    .select("id,user_id,provider,provider_key_encrypted,model_default,is_active,custom_base_url,custom_models_url,custom_kind,custom_auth_scheme,custom_auth_header,custom_extra_headers,custom_path_prefix,custom_chat_path,custom_models_path,custom_response_format")
    .eq("key_hash", key_hash).maybeSingle();
  if (!keyRow || !keyRow.is_active) {
    return json(errorForShape(reqShape, "Invalid or revoked API key", "invalid_request_error"), 401);
  }

  // Body — parse, then translate to canonical OpenAI Chat Completions shape.
  // Every downstream component (policy, throttle, alias, route, upstream
  // dispatch, output evaluation) operates on the canonical shape; we only
  // translate back at the very end.
  let publicBody: any;
  try { publicBody = await req.json(); }
  catch { return json(errorForShape(reqShape, "Invalid JSON body", "invalid_request_error"), 400); }

  const body: any = translateRequestToOpenAI(reqShape, publicBody, route.pathModel);
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return json(errorForShape(reqShape, "messages must be a non-empty array", "invalid_request_error"), 400);
  }
  // Non-OpenAI shapes are served non-stream in this first pass; SDK consumers
  // get a single JSON response in their native format. OpenAI shape keeps
  // full streaming support unchanged.
  if (reqShape !== "openai") body.stream = false;
  let model: string = body.model || keyRow.model_default;
  const stream = !!body.stream;

  // ---- Alias rewrite (per API key) -----------------------------------------
  // If the requested model matches an alias, swap to the target_model and
  // (optionally) swap the resolved endpoint config to a user-owned endpoint.
  let aliasTargetEndpoint: any | null = null;
  if (model) {
    const { data: alias } = await sb.from("model_aliases")
      .select("target_model,target_endpoint_id")
      .eq("api_key_id", keyRow.id).eq("alias", String(model).toLowerCase())
      .maybeSingle();
    if (alias) {
      model = alias.target_model;
      if (alias.target_endpoint_id) {
        const { data: ep } = await sb.from("endpoints").select("*")
          .eq("id", alias.target_endpoint_id).eq("user_id", keyRow.user_id).maybeSingle();
        if (ep) aliasTargetEndpoint = ep;
      }
    }
  }

  // ---- Route resolution ----------------------------------------------------
  // `model: "route:<name>"` triggers fallback chain walking. Steps are tried
  // in order; we fall back on configured triggers (5xx, 429, timeout). Only
  // applies to non-stream and pre-stream errors — once bytes start flowing the
  // user sees the live response.
  type RouteStepResolved = {
    endpointRow: any;          // user-owned endpoint row
    model: string;
    upstreamKey: string | null;
  };
  let routeSteps: RouteStepResolved[] | null = null;
  let routeConfig: { fallback_on_5xx: boolean; fallback_on_429: boolean; fallback_on_timeout: boolean; timeout_ms: number } | null = null;
  if (typeof model === "string" && model.toLowerCase().startsWith("route:")) {
    const routeName = model.slice("route:".length).trim();
    const { data: route } = await sb.from("routes")
      .select("id,fallback_on_5xx,fallback_on_429,fallback_on_timeout,timeout_ms")
      .eq("user_id", keyRow.user_id).eq("name", routeName).maybeSingle();
    if (!route) return json(errorForShape(reqShape, `Route not found: ${routeName}`, "invalid_request_error"), 404);
    const { data: steps } = await sb.from("route_steps")
      .select("position,endpoint_id,model")
      .eq("route_id", route.id).order("position", { ascending: true });
    if (!steps || steps.length === 0) return json(errorForShape(reqShape, `Route ${routeName} has no steps`, "server_error"), 500);
    const epIds = [...new Set(steps.map((s: any) => s.endpoint_id))];
    const { data: eps } = await sb.from("endpoints").select("*")
      .in("id", epIds).eq("user_id", keyRow.user_id);
    const epMap = new Map((eps ?? []).map((e: any) => [e.id, e]));
    routeSteps = [];
    for (const s of steps) {
      const ep = epMap.get(s.endpoint_id);
      if (!ep) continue;
      const k = ep.provider_key_encrypted ? await decryptString(ep.provider_key_encrypted) : null;
      routeSteps.push({ endpointRow: ep, model: s.model, upstreamKey: k });
    }
    if (routeSteps.length === 0) return json(errorForShape(reqShape, `Route ${routeName} has no usable steps`, "server_error"), 500);
    routeConfig = {
      fallback_on_5xx: route.fallback_on_5xx,
      fallback_on_429: route.fallback_on_429,
      fallback_on_timeout: route.fallback_on_timeout,
      timeout_ms: route.timeout_ms,
    };
    // Initial model used by the downstream pipeline; will be overridden per step
    model = routeSteps[0].model;
  }

  const isCustom = keyRow.provider === "custom";
  const provider = isCustom ? null : getProvider(keyRow.provider);
  if (!isCustom && !provider) {
    return json(errorForShape(reqShape, `Unknown provider: ${keyRow.provider}`, "server_error"), 500);
  }

  // Resolve upstream credentials for the *default* (no-route) path.
  let upstreamKey: string | null = null;
  if (provider?.managed) {
    upstreamKey = Deno.env.get("LOVABLE_API_KEY") || null;
    if (!upstreamKey) return json(errorForShape(reqShape, "LOVABLE_API_KEY not configured", "server_error"), 500);
  } else if (keyRow.provider_key_encrypted) {
    upstreamKey = await decryptString(keyRow.provider_key_encrypted);
  } else if (!isCustom) {
    return json(errorForShape(reqShape, `${provider!.label} key not stored`, "server_error"), 500);
  }
  // For custom + auth_scheme === 'none', upstreamKey remains null which is fine.

  // Load workspace policy state (legacy + v2 layered).
  const policyState = await loadWorkspacePolicy(sb, keyRow.user_id);
  const { legacy, rules, intents, settings, blockMessage } = policyState;
  const systemPrompt = extractSystemPrompt(body.messages);
  const toolsRequested = Array.isArray(body.tools) && body.tools.length > 0;

  // Flatten the prompt for evaluation. Note: original payload is forwarded as-is.
  const promptText = body.messages.map((msg: any) =>
    typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "")).join("\n");

  // ---- Throttle check ---------------------------------------------------
  // Per-API-key risk window: count flag/block verdicts in the recent window.
  // Threshold of 0 = disabled. We do this BEFORE the (possibly LLM-backed)
  // policy evaluation so abusive keys can't run up our intent-classifier bill.
  //
  // Exponential backoff: each prior `throttled` event for this key inside the
  // window doubles the cool-down (60s base, capped at the full window). While
  // a key is in cool-down we deny with 429 + Retry-After. Once the key clears
  // both the cool-down AND drops back below the risky-request threshold, it
  // resumes normal traffic.
  const throttleThreshold = settings.throttle_flag_threshold ?? 0;
  const throttleWindowMin = settings.throttle_window_minutes ?? 5;
  if (throttleThreshold > 0) {
    const windowMs = throttleWindowMin * 60_000;
    const sinceIso = new Date(Date.now() - windowMs).toISOString();

    // Pull both signals in parallel: the rolling risky-count and the most
    // recent throttle event (with the running streak count) for backoff.
    const [riskyRes, throttleRes] = await Promise.all([
      sb.from("request_logs")
        .select("id", { count: "exact", head: true })
        .eq("api_key_id", keyRow.id)
        .in("verdict", ["flag", "block"])
        .gte("created_at", sinceIso),
      sb.from("request_logs")
        .select("created_at", { count: "exact" })
        .eq("api_key_id", keyRow.id)
        .eq("status", "throttled")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const riskyCount = riskyRes.count ?? 0;
    const throttledCount = throttleRes.count ?? 0;
    const lastThrottleAt = throttleRes.data?.[0]?.created_at
      ? Date.parse(throttleRes.data[0].created_at) : 0;

    // Cool-down doubles per prior throttle: 60s, 2m, 4m, 8m, ... capped at
    // the configured window so a single bad burst can't lock the key out
    // beyond the operator's risk window.
    const BACKOFF_BASE_MS = 60_000;
    const backoffMs = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, throttledCount),
      windowMs,
    );
    const remainingCooldownMs = lastThrottleAt
      ? Math.max(0, lastThrottleAt + backoffMs - Date.now()) : 0;

    const overThreshold = riskyCount >= throttleThreshold;
    const inCooldown = remainingCooldownMs > 0;

    if (overThreshold || inCooldown) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((inCooldown ? remainingCooldownMs : backoffMs) / 1000),
      );
      const reason = inCooldown
        ? `Throttled: backoff active (${throttledCount} prior throttle${throttledCount === 1 ? "" : "s"} in ${throttleWindowMin} min). Retry in ${retryAfterSec}s.`
        : `Throttled: ${riskyCount} risky requests in the last ${throttleWindowMin} min (threshold ${throttleThreshold}). Retry in ${retryAfterSec}s.`;

      await sb.from("request_logs").insert({
        user_id: keyRow.user_id, api_key_id: keyRow.id, provider: keyRow.provider,
        model, messages: body.messages,
        status: "throttled", verdict: "block", block_reason: reason,
        verdict_layers: [{
          layer: "behavioral", verdict: "block", rule: "throttle",
          reason,
          // Surface the backoff state for observability / dashboard.
          matched: JSON.stringify({
            risky_count: riskyCount,
            prior_throttles: throttledCount,
            backoff_ms: backoffMs,
            retry_after_sec: retryAfterSec,
          }),
        }],
        latency_ms: Date.now() - start, tokens_in: 0, tokens_out: 0,
      });
      return json(
        {
          ...openaiErrorShape(reason, "rate_limit_exceeded"),
          anveguard: {
            throttled: true, reason,
            retry_after_sec: retryAfterSec,
            backoff_ms: backoffMs,
            prior_throttles: throttledCount,
          },
        },
        429,
        { "Retry-After": String(retryAfterSec) },
      );
    }
  }

  // ---- Layered input evaluation -----------------------------------------
  const inputEval: EvaluateResult = await evaluatePolicy(
    { text: promptText, direction: "input", legacy, rules, intents, settings, conversation: body.messages },
    { systemPrompt, toolsRequested },
  );

  const logBase: any = {
    user_id: keyRow.user_id,
    api_key_id: keyRow.id,
    provider: keyRow.provider,
    model,
    messages: body.messages,
    detected_intent: inputEval.detected_intent ?? null,
    intent_confidence: inputEval.intent_confidence ?? null,
  };

  if (inputEval.verdict === "block") {
    const reason = inputEval.layers.find((l) => l.verdict === "block")?.reason ?? "Blocked by policy";
    const responsePayload = {
      id: `chatcmpl-blocked-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, finish_reason: "content_filter",
        message: { role: "assistant", content: blockMessage } }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      anveguard: { blocked: true, reason, layers: inputEval.layers },
    };
    await sb.from("request_logs").insert({
      ...logBase, status: "blocked_input", block_reason: reason,
      verdict: "block", verdict_layers: inputEval.layers,
      response: responsePayload, latency_ms: Date.now() - start,
      tokens_in: 0, tokens_out: 0,
    });
    await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
    return json(translateResponseFromOpenAI(reqShape, responsePayload), 200);
  }

  // Sanitize action: rewrite each message's content independently (we can't
  // use the flattened promptText spans because indices don't map back to
  // individual messages once joined). Original payload object is mutated in
  // place — every downstream attempt forwards the redacted version.
  let sanitizationApplied = false;
  if (inputEval.verdict === "sanitize") {
    for (const msg of body.messages) {
      const original = typeof msg.content === "string" ? msg.content : null;
      if (!original) continue; // skip non-string content (multimodal, tool calls)
      const norm = original.toLowerCase(); // cheap; engine normalizer is heavier but injection regex is case-insensitive
      const layers = evaluateInjection(original, norm, "input");
      const spans = layers.flatMap((l) => l.spans ?? []);
      if (spans.length > 0) {
        msg.content = applySanitization(original, spans);
        sanitizationApplied = true;
      }
    }
    logBase.messages = body.messages; // log the sanitized version
  }

  // ---- Build attempt list -------------------------------------------------
  // Each attempt is (synthetic keyRow shape, model, upstreamKey). For routes
  // we get N attempts in priority order; for the non-route path it's exactly
  // one attempt, optionally swapped to alias_target_endpoint.
  type Attempt = { keyRowLike: any; model: string; upstreamKey: string | null; label: string };
  const endpointToKeyRowShape = (ep: any): any => ({
    provider: "custom",
    custom_base_url: ep.base_url,
    custom_models_url: ep.models_url,
    custom_kind: ep.kind,
    custom_auth_scheme: ep.auth_scheme,
    custom_auth_header: ep.auth_header,
    custom_extra_headers: ep.extra_headers ?? {},
    custom_path_prefix: ep.path_prefix,
    custom_chat_path: ep.chat_path,
    custom_models_path: ep.models_path,
    custom_response_format: ep.response_format,
  });

  let attempts: Attempt[];
  if (routeSteps && routeConfig) {
    attempts = routeSteps.map((s) => ({
      keyRowLike: endpointToKeyRowShape(s.endpointRow),
      model: s.model,
      upstreamKey: s.upstreamKey,
      label: `route step → ${s.endpointRow.name}`,
    }));
  } else if (aliasTargetEndpoint) {
    const k = aliasTargetEndpoint.provider_key_encrypted
      ? await decryptString(aliasTargetEndpoint.provider_key_encrypted)
      : null;
    attempts = [{
      keyRowLike: endpointToKeyRowShape(aliasTargetEndpoint),
      model,
      upstreamKey: k,
      label: `alias → ${aliasTargetEndpoint.name}`,
    }];
  } else {
    attempts = [{ keyRowLike: keyRow, model, upstreamKey, label: "default" }];
  }

  // ---- Try attempts in order ----------------------------------------------
  let upstream: Response | null = null;
  let forwardFormat: "chat_completions" | "responses" | "anthropic_messages" = "chat_completions";
  let lastErrorReason = "";
  let lastErrorStatus = 502;
  let chosenModel = model;

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    let resolved;
    try {
      resolved = resolveEndpoint(a.keyRowLike, a.upstreamKey);
    } catch (e) {
      lastErrorReason = `Endpoint resolution failed (${a.label}): ${e instanceof Error ? e.message : String(e)}`;
      lastErrorStatus = 500;
      if (routeConfig && i < attempts.length - 1) continue;
      break;
    }
    forwardFormat = resolved.response_format;
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...resolved.headers,
    };
    chosenModel = a.model;

    let forwardBody: any;
    if (forwardFormat === "anthropic_messages") {
      forwardBody = openaiToAnthropicRequest({ ...body, model: a.model });
    } else if (forwardFormat === "responses") {
      forwardBody = chatToResponsesRequest({ ...body, model: a.model, stream });
    } else {
      forwardBody = { ...body, model: a.model, stream };
    }

    const ctrl = new AbortController();
    const timeoutMs = routeConfig?.timeout_ms ?? 0;
    const tid = timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let resp: Response;
    try {
      resp = await fetch(resolved.url, {
        method: "POST", headers: forwardHeaders,
        body: JSON.stringify(forwardBody),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (tid) clearTimeout(tid);
      const isAbort = e instanceof Error && (e.name === "AbortError" || /abort|timeout/i.test(e.message));
      lastErrorReason = `Upstream fetch failed (${a.label}): ${isAbort ? "timeout" : (e instanceof Error ? e.message : String(e))}`;
      lastErrorStatus = 502;
      const canFallback = !!routeConfig && (
        (isAbort && routeConfig.fallback_on_timeout) ||
        (!isAbort && routeConfig.fallback_on_5xx)
      );
      if (canFallback && i < attempts.length - 1) continue;
      await sb.from("request_logs").insert({
        ...logBase, model: chosenModel, status: "error", block_reason: lastErrorReason,
        latency_ms: Date.now() - start,
      });
      return json(errorForShape(reqShape, lastErrorReason, "server_error"), lastErrorStatus);
    }
    if (tid) clearTimeout(tid);

    if (!resp.ok) {
      const text = await resp.text();
      lastErrorReason = `Upstream ${resp.status} (${a.label}): ${text.slice(0, 500)}`;
      lastErrorStatus = resp.status;
      const is5xx = resp.status >= 500 && resp.status <= 599;
      const is429 = resp.status === 429;
      const canFallback = !!routeConfig && (
        (is5xx && routeConfig.fallback_on_5xx) ||
        (is429 && routeConfig.fallback_on_429)
      );
      if (canFallback && i < attempts.length - 1) continue;
      await sb.from("request_logs").insert({
        ...logBase, model: chosenModel, status: "error", block_reason: lastErrorReason,
        latency_ms: Date.now() - start,
      });
      if (reqShape !== "openai") {
        return json(errorForShape(reqShape, lastErrorReason, "upstream_error"), resp.status);
      }
      return new Response(text, {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    upstream = resp;
    break;
  }

  if (!upstream) {
    await sb.from("request_logs").insert({
      ...logBase, status: "error", block_reason: lastErrorReason || "All route attempts failed",
      latency_ms: Date.now() - start,
    });
    return json(errorForShape(reqShape, lastErrorReason || "All route attempts failed", "server_error"), lastErrorStatus);
  }

  // Reflect what actually ran in subsequent code paths and logs.
  (logBase as any).model = chosenModel;
  model = chosenModel;



  // ===== Streaming =====
  if (stream && upstream.body) {
    if (forwardFormat === "anthropic_messages") {
      const { stream: oaiStream, done } = anthropicStreamToOpenAI(upstream.body, model);
      done.then(async ({ assistantText, usage }) => {
        const out = await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested });
        await sb.from("request_logs").insert({
          ...logBase, status: out.status, block_reason: out.blockReason,
          verdict: out.status === "blocked_output" ? "block" : "allow",
          verdict_layers: out.layers,
          response: { streamed: true, content: assistantText },
          latency_ms: Date.now() - start,
          tokens_in: usage?.prompt_tokens ?? null,
          tokens_out: usage?.completion_tokens ?? null,
        });
        await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      });
      return new Response(oaiStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    if (forwardFormat === "responses") {
      const { stream: oaiStream, done } = responsesStreamToChat(upstream.body, model);
      done.then(async ({ assistantText, usage, finalModel }) => {
        const out = await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested });
        await sb.from("request_logs").insert({
          ...logBase, model: finalModel, status: out.status, block_reason: out.blockReason,
          verdict: out.status === "blocked_output" ? "block" : "allow",
          verdict_layers: out.layers,
          response: { streamed: true, content: assistantText },
          latency_ms: Date.now() - start,
          tokens_in: usage?.prompt_tokens ?? null,
          tokens_out: usage?.completion_tokens ?? null,
        });
        await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      });
      return new Response(oaiStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // OpenAI-compatible passthrough w/ tap
    let buffered = "";
    let assistantText = "";
    let finalUsage: any = null;
    let finalModel = model;
    const decoder = new TextDecoder();

    const transformed = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            buffered += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffered.indexOf("\n")) !== -1) {
              const line = buffered.slice(0, idx).trim();
              buffered = buffered.slice(idx + 1);
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const obj = JSON.parse(payload);
                const delta = obj?.choices?.[0]?.delta?.content;
                if (typeof delta === "string") assistantText += delta;
                if (obj?.usage) finalUsage = obj.usage;
                if (obj?.model) finalModel = obj.model;
              } catch { /* partial */ }
            }
          }
        } finally {
          controller.close();
          const out = await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested });
          await sb.from("request_logs").insert({
            ...logBase, model: finalModel, status: out.status, block_reason: out.blockReason,
            verdict: out.status === "blocked_output" ? "block" : "allow",
            verdict_layers: out.layers,
            response: { streamed: true, content: assistantText },
            latency_ms: Date.now() - start,
            tokens_in: finalUsage?.prompt_tokens ?? null,
            tokens_out: finalUsage?.completion_tokens ?? null,
          });
          await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
        }
      },
    });
    return new Response(transformed, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // ===== Non-streaming =====
  const rawData = await upstream.json();
  const data =
    forwardFormat === "anthropic_messages" ? anthropicToOpenAIResponse(rawData) :
    forwardFormat === "responses" ? responsesToChatResponse(rawData, model) :
    rawData;
  const assistantText = data?.choices?.[0]?.message?.content ?? "";
  const outEval = typeof assistantText === "string"
    ? await evaluateOutput(assistantText, policyState, { systemPrompt, toolsRequested })
    : { status: "allowed" as const, blockReason: null, layers: [] as any[] };

  let finalResponse = data;
  const status = outEval.status;
  const blockReason = outEval.blockReason;

  if (status === "blocked_output") {
    finalResponse = {
      ...data,
      choices: [{
        ...(data.choices?.[0] ?? {}),
        finish_reason: "content_filter",
        message: { role: "assistant", content: blockMessage },
      }],
      anveguard: { blocked: true, reason: blockReason, layers: outEval.layers },
    };
  }

  await sb.from("request_logs").insert({
    ...logBase, model: data?.model || model, status, block_reason: blockReason,
    verdict: status === "blocked_output" ? "block" : "allow",
    verdict_layers: outEval.layers,
    response: finalResponse, latency_ms: Date.now() - start,
    tokens_in: data?.usage?.prompt_tokens ?? null,
    tokens_out: data?.usage?.completion_tokens ?? null,
  });
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  return json(translateResponseFromOpenAI(reqShape, finalResponse), 200);
});
