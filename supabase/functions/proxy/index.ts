// AnveGuard proxy — OpenAI-compatible /v1/chat/completions endpoint.
// Public function; authenticated via AnveGuard API keys (Authorization: Bearer ag_live_...).
import { corsHeaders, json, service, sha256Hex, decryptString,
  GLOBAL_DEFAULT_BLOCKED, checkPolicy } from "../_shared/anveguard.ts";
import { getProvider, resolveEndpoint } from "../_shared/providers.ts";
import { openaiToAnthropicRequest, anthropicToOpenAIResponse,
  anthropicStreamToOpenAI } from "../_shared/anthropic.ts";

function openaiErrorShape(message: string, type = "policy_violation") {
  return { error: { message, type, code: type } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const start = Date.now();
  const sb = service();

  // Auth
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer\s+(ag_live_\S+)/i);
  if (!m) return json(openaiErrorShape("Missing or invalid AnveGuard API key", "invalid_request_error"), 401);
  const apiKeyPlain = m[1];
  const key_hash = await sha256Hex(apiKeyPlain);

  const { data: keyRow } = await sb.from("api_keys")
    .select("id,user_id,provider,provider_key_encrypted,model_default,is_active,custom_base_url,custom_models_url,custom_kind,custom_auth_scheme,custom_auth_header,custom_extra_headers")
    .eq("key_hash", key_hash).maybeSingle();
  if (!keyRow || !keyRow.is_active) {
    return json(openaiErrorShape("Invalid or revoked API key", "invalid_request_error"), 401);
  }

  const isCustom = keyRow.provider === "custom";
  const provider = isCustom ? null : getProvider(keyRow.provider);
  if (!isCustom && !provider) {
    return json(openaiErrorShape(`Unknown provider: ${keyRow.provider}`, "server_error"), 500);
  }

  // Body
  let body: any;
  try { body = await req.json(); } catch { return json(openaiErrorShape("Invalid JSON body", "invalid_request_error"), 400); }
  if (!Array.isArray(body?.messages)) return json(openaiErrorShape("messages must be an array", "invalid_request_error"), 400);
  const model = body.model || keyRow.model_default;
  const stream = !!body.stream;

  // Resolve upstream credentials
  let upstreamKey: string | null = null;
  if (provider?.managed) {
    upstreamKey = Deno.env.get("LOVABLE_API_KEY") || null;
    if (!upstreamKey) return json(openaiErrorShape("LOVABLE_API_KEY not configured", "server_error"), 500);
  } else if (keyRow.provider_key_encrypted) {
    upstreamKey = await decryptString(keyRow.provider_key_encrypted);
  } else if (!isCustom) {
    return json(openaiErrorShape(`${provider!.label} key not stored`, "server_error"), 500);
  }
  // For custom + auth_scheme === 'none', upstreamKey remains null which is fine.

  // Load policies
  const { data: pol } = await sb.from("policies").select("*").eq("user_id", keyRow.user_id).maybeSingle();
  const blocked = [
    ...(pol?.blocked_keywords ?? []),
    ...(pol?.use_global_defaults !== false ? GLOBAL_DEFAULT_BLOCKED : []),
  ];
  const allowed = pol?.allowed_keywords ?? [];
  const blockMessage = pol?.block_message || "This request was blocked by your organization's AI policy.";

  // Input check
  const promptText = body.messages.map((msg: any) =>
    typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "")).join("\n");
  const inputCheck = checkPolicy(promptText, blocked, allowed);

  const logBase = {
    user_id: keyRow.user_id,
    api_key_id: keyRow.id,
    provider: keyRow.provider,
    model,
    messages: body.messages,
  };

  if (inputCheck.blocked) {
    const reason = `Matched blocked keyword: "${inputCheck.matched}"`;
    const responsePayload = {
      id: `chatcmpl-blocked-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, finish_reason: "content_filter",
        message: { role: "assistant", content: blockMessage } }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      anveguard: { blocked: true, reason },
    };
    await sb.from("request_logs").insert({
      ...logBase, status: "blocked_input", block_reason: reason,
      response: responsePayload, latency_ms: Date.now() - start,
      tokens_in: 0, tokens_out: 0,
    });
    await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
    return json(responsePayload, 200);
  }

  // Build forward request via resolveEndpoint (handles built-in + custom)
  let forwardUrl: string;
  let forwardKind: "openai_compatible" | "anthropic";
  let forwardHeaders: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const resolved = resolveEndpoint(keyRow as any, upstreamKey);
    forwardUrl = resolved.url;
    forwardKind = resolved.kind;
    forwardHeaders = { ...forwardHeaders, ...resolved.headers };
  } catch (e) {
    return json(openaiErrorShape(
      `Endpoint resolution failed: ${e instanceof Error ? e.message : String(e)}`,
      "server_error"), 500);
  }

  let forwardBody: any;
  if (forwardKind === "anthropic") {
    forwardBody = openaiToAnthropicRequest({ ...body, model });
  } else {
    forwardBody = { ...body, model, stream };
  }

  let upstream: Response;
  try {
    upstream = await fetch(forwardUrl, { method: "POST", headers: forwardHeaders, body: JSON.stringify(forwardBody) });
  } catch (e) {
    const reason = `Upstream fetch failed: ${e instanceof Error ? e.message : String(e)}`;
    await sb.from("request_logs").insert({ ...logBase, status: "error", block_reason: reason, latency_ms: Date.now() - start });
    return json(openaiErrorShape(reason, "server_error"), 502);
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    await sb.from("request_logs").insert({
      ...logBase, status: "error", block_reason: `Upstream ${upstream.status}: ${text.slice(0, 500)}`,
      latency_ms: Date.now() - start,
    });
    return new Response(text, { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ===== Streaming =====
  if (stream && upstream.body) {
    if (provider.kind === "anthropic") {
      const { stream: oaiStream, done } = anthropicStreamToOpenAI(upstream.body, model);
      done.then(async ({ assistantText, usage }) => {
        const outCheck = checkPolicy(assistantText, blocked, allowed);
        const status = outCheck.blocked ? "blocked_output" : "allowed";
        await sb.from("request_logs").insert({
          ...logBase, status,
          block_reason: outCheck.blocked ? `Output matched: "${outCheck.matched}"` : null,
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
          const outCheck = checkPolicy(assistantText, blocked, allowed);
          const status = outCheck.blocked ? "blocked_output" : "allowed";
          await sb.from("request_logs").insert({
            ...logBase, model: finalModel, status,
            block_reason: outCheck.blocked ? `Output matched: "${outCheck.matched}"` : null,
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
  const data = provider.kind === "anthropic" ? anthropicToOpenAIResponse(rawData) : rawData;
  const assistantText = data?.choices?.[0]?.message?.content ?? "";
  const outCheck = typeof assistantText === "string"
    ? checkPolicy(assistantText, blocked, allowed) : { blocked: false };

  let finalResponse = data;
  let status: "allowed" | "blocked_output" = "allowed";
  let blockReason: string | null = null;

  if (outCheck.blocked) {
    status = "blocked_output";
    blockReason = `Output matched: "${outCheck.matched}"`;
    finalResponse = {
      ...data,
      choices: [{
        ...(data.choices?.[0] ?? {}),
        finish_reason: "content_filter",
        message: { role: "assistant", content: blockMessage },
      }],
      anveguard: { blocked: true, reason: blockReason },
    };
  }

  await sb.from("request_logs").insert({
    ...logBase, model: data?.model || model, status, block_reason: blockReason,
    response: finalResponse, latency_ms: Date.now() - start,
    tokens_in: data?.usage?.prompt_tokens ?? null,
    tokens_out: data?.usage?.completion_tokens ?? null,
  });
  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  return json(finalResponse, 200);
});
