// Translators between AnveGuard's internal canonical shape (OpenAI Chat
// Completions) and the public request/response shapes that client SDKs
// expect on different endpoint paths.
//
//   /v1/chat/completions                       -> "openai"       (passthrough)
//   /v1/messages                               -> "anthropic"
//   /v1beta/models/<model>:generateContent     -> "gemini"
//   /v1beta/models/<model>:streamGenerateContent -> "gemini" (treated as non-stream
//                                                              for now; we return one
//                                                              JSON object instead of
//                                                              a partial-content stream)
//
// Keeping every shape on a single canonical pipeline means policy
// evaluation, throttling, alias rewriting and logging only have to be
// implemented once.

export type RequestShape = "openai" | "anthropic" | "gemini" | "openai_image" | "openai_audio_transcription" | "openai_audio_speech";

export interface ShapeRoute {
  shape: RequestShape;
  /** Model parsed from the URL path (Gemini), if any. */
  pathModel?: string;
  /** True for Gemini's streamGenerateContent — currently downgraded to non-stream. */
  pathStream?: boolean;
  /** True if the route is recognised but execution isn't implemented yet
   *  (currently `openai_image`). Proxy returns 501 with a documented message
   *  so SDK users see a stable error instead of a generic "method not
   *  allowed". */
  notImplemented?: boolean;
}

/**
 * Decide the request shape from the incoming URL path. Anything we don't
 * recognise falls back to OpenAI shape so legacy clients keep working
 * even when they POST to the function root.
 */
export function detectRequestShape(url: URL): ShapeRoute {
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/v1/messages") || path === "/v1/messages") {
    return { shape: "anthropic" };
  }
  // /v1beta/models/<model>:generateContent or :streamGenerateContent
  const gem = path.match(/\/v1beta\/models\/([^:/]+):(stream)?[gG]enerateContent$/);
  if (gem) return { shape: "gemini", pathModel: gem[1], pathStream: !!gem[2] };
  // OpenAI image generation — path is recognised but execution is the
  // Phase 5 work item. Stamping the shape lets the proxy return a stable
  // 501 with a documented message instead of falling through to the chat
  // completions handler (which would error confusingly on the missing
  // `messages` field).
  if (path.endsWith("/v1/images/generations") || path === "/v1/images/generations") {
    return { shape: "openai_image", notImplemented: true };
  }
  // OpenAI Whisper audio transcription — multipart upload, JSON response
  // with `text` field. Different shape from chat (no messages array,
  // body is multipart not JSON), so we route to a dedicated handler.
  if (path.endsWith("/v1/audio/transcriptions") || path === "/v1/audio/transcriptions") {
    return { shape: "openai_audio_transcription" };
  }
  // OpenAI TTS — JSON body { model, input, voice }, response is BINARY
  // audio (mp3/opus/aac/flac). Policy runs on the `input` text before
  // forwarding so harmful prompts can't be turned into audio.
  if (path.endsWith("/v1/audio/speech") || path === "/v1/audio/speech") {
    return { shape: "openai_audio_speech" };
  }
  return { shape: "openai" };
}

// ---------------------------------------------------------------------------
// Anthropic <-> OpenAI
// ---------------------------------------------------------------------------

export function anthropicRequestToOpenAI(body: any): any {
  const messages: any[] = [];
  // Anthropic system can be a string or an array of content blocks.
  if (typeof body?.system === "string" && body.system.length > 0) {
    messages.push({ role: "system", content: body.system });
  } else if (Array.isArray(body?.system)) {
    const txt = body.system
      .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
      .filter(Boolean).join("\n\n");
    if (txt) messages.push({ role: "system", content: txt });
  }
  for (const m of body?.messages ?? []) {
    if (!m?.role) continue;
    let content: string;
    if (typeof m.content === "string") content = m.content;
    else if (Array.isArray(m.content)) {
      content = m.content
        .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
        .filter(Boolean).join("\n");
    } else content = JSON.stringify(m.content ?? "");
    messages.push({ role: m.role, content });
  }
  return {
    model: body?.model,
    messages,
    max_tokens: body?.max_tokens,
    temperature: body?.temperature,
    top_p: body?.top_p,
    stop: body?.stop_sequences,
    stream: !!body?.stream,
  };
}

export function openAIResponseToAnthropic(oai: any): any {
  const choice = oai?.choices?.[0] ?? {};
  const text = choice?.message?.content ?? "";
  const finishMap: Record<string, string> = {
    stop: "end_turn", length: "max_tokens", content_filter: "stop_sequence",
  };
  const out: any = {
    id: oai?.id ?? `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    model: oai?.model,
    content: [{ type: "text", text: typeof text === "string" ? text : String(text ?? "") }],
    stop_reason: finishMap[choice?.finish_reason] ?? "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: oai?.usage?.prompt_tokens ?? 0,
      output_tokens: oai?.usage?.completion_tokens ?? 0,
    },
  };
  if (oai?.anveguard) out.anveguard = oai.anveguard;
  return out;
}

// ---------------------------------------------------------------------------
// Gemini <-> OpenAI
// ---------------------------------------------------------------------------

export function geminiRequestToOpenAI(body: any, pathModel?: string): any {
  const messages: any[] = [];
  // systemInstruction can be a Content object or a plain string.
  const sys = body?.systemInstruction ?? body?.system_instruction;
  if (sys) {
    const text = typeof sys === "string"
      ? sys
      : (sys?.parts ?? []).map((p: any) => p?.text ?? "").filter(Boolean).join("\n");
    if (text) messages.push({ role: "system", content: text });
  }
  for (const c of body?.contents ?? []) {
    const role = c?.role === "model" ? "assistant" : "user";
    const text = (c?.parts ?? [])
      .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
      .filter(Boolean).join("\n");
    messages.push({ role, content: text });
  }
  const cfg = body?.generationConfig ?? body?.generation_config ?? {};
  return {
    model: body?.model ?? pathModel,
    messages,
    max_tokens: cfg?.maxOutputTokens ?? cfg?.max_output_tokens,
    temperature: cfg?.temperature,
    top_p: cfg?.topP ?? cfg?.top_p,
    stop: cfg?.stopSequences ?? cfg?.stop_sequences,
    stream: false, // we never forward Gemini streaming in this first pass
  };
}

export function openAIResponseToGemini(oai: any): any {
  const choice = oai?.choices?.[0] ?? {};
  const text = choice?.message?.content ?? "";
  const finishMap: Record<string, string> = {
    stop: "STOP", length: "MAX_TOKENS", content_filter: "SAFETY",
  };
  const out: any = {
    candidates: [{
      content: {
        role: "model",
        parts: [{ text: typeof text === "string" ? text : String(text ?? "") }],
      },
      finishReason: finishMap[choice?.finish_reason] ?? "STOP",
      index: 0,
      safetyRatings: [],
    }],
    usageMetadata: {
      promptTokenCount: oai?.usage?.prompt_tokens ?? 0,
      candidatesTokenCount: oai?.usage?.completion_tokens ?? 0,
      totalTokenCount: oai?.usage?.total_tokens
        ?? ((oai?.usage?.prompt_tokens ?? 0) + (oai?.usage?.completion_tokens ?? 0)),
    },
    modelVersion: oai?.model,
  };
  if (oai?.anveguard) out.anveguard = oai.anveguard;
  return out;
}

/** Convert an internal OpenAI-shape response into the requested public shape. */
export function translateResponseFromOpenAI(shape: RequestShape, oai: any): any {
  if (shape === "anthropic") return openAIResponseToAnthropic(oai);
  if (shape === "gemini")    return openAIResponseToGemini(oai);
  return oai;
}

/** Convert an incoming public-shape body into the internal OpenAI shape. */
export function translateRequestToOpenAI(
  shape: RequestShape, body: any, pathModel?: string,
): any {
  if (shape === "anthropic") return anthropicRequestToOpenAI(body);
  if (shape === "gemini")    return geminiRequestToOpenAI(body, pathModel);
  return body;
}
