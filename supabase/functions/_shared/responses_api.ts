// OpenAI "Responses" API <-> Chat Completions translation.
// Spec: https://platform.openai.com/docs/api-reference/responses
// We accept Chat Completions input from clients and adapt it for upstream
// servers that only speak the Responses format, then translate the reply
// back into a Chat Completions shape.

type ChatMessage = { role: string; content: string | unknown };

/** Convert a Chat Completions request body into a Responses API request body. */
export function chatToResponsesRequest(body: any): Record<string, unknown> {
  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];

  // Pull out the system messages as `instructions` (Responses convention).
  const systemParts: string[] = [];
  const inputItems: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === "system" || m.role === "developer") {
      systemParts.push(typeof m.content === "string" ? m.content : JSON.stringify(m.content));
      continue;
    }
    inputItems.push({
      role: m.role,
      content: typeof m.content === "string"
        ? [{ type: "input_text", text: m.content }]
        : m.content, // pass through structured content
    });
  }

  const out: Record<string, unknown> = {
    model: body.model,
    input: inputItems,
  };
  if (systemParts.length) out.instructions = systemParts.join("\n\n");
  if (typeof body.temperature === "number") out.temperature = body.temperature;
  if (typeof body.top_p === "number") out.top_p = body.top_p;
  if (typeof body.max_tokens === "number") out.max_output_tokens = body.max_tokens;
  if (typeof body.max_output_tokens === "number") out.max_output_tokens = body.max_output_tokens;
  if (body.stream) out.stream = true;
  if (body.tools) out.tools = body.tools;
  if (body.tool_choice) out.tool_choice = body.tool_choice;
  if (body.metadata) out.metadata = body.metadata;
  if (body.response_format) out.text = { format: body.response_format };
  return out;
}

/** Extract assistant text from a Responses API non-streaming reply. */
function extractResponsesText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const parts: string[] = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
        else if (c?.type === "text" && typeof c.text === "string") parts.push(c.text);
      }
    }
  }
  return parts.join("");
}

/** Convert a Responses API non-streaming reply into a Chat Completions reply. */
export function responsesToChatResponse(data: any, fallbackModel: string): Record<string, unknown> {
  const text = extractResponsesText(data);
  const usage = data?.usage ?? {};
  return {
    id: data?.id || `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: data?.model || fallbackModel,
    choices: [{
      index: 0,
      finish_reason: data?.status === "incomplete" ? "length" : "stop",
      message: { role: "assistant", content: text },
    }],
    usage: {
      prompt_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
      completion_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens
        ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)),
    },
  };
}

/**
 * Convert a Responses API SSE stream into a Chat Completions SSE stream.
 * Returns a stream the client can consume + a `done` promise resolving with
 * the aggregated assistant text & usage so the proxy can run output policy
 * checks and write logs.
 */
export function responsesStreamToChat(
  upstream: ReadableStream<Uint8Array>,
  model: string,
): { stream: ReadableStream<Uint8Array>; done: Promise<{ assistantText: string; usage: any; finalModel: string }> } {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let assistantText = "";
  let usage: any = null;
  let finalModel = model;
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  let resolveDone!: (v: { assistantText: string; usage: any; finalModel: string }) => void;
  const done = new Promise<{ assistantText: string; usage: any; finalModel: string }>((r) => { resolveDone = r; });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Initial chunk with role.
      const first = {
        id, object: "chat.completion.chunk", created, model: finalModel,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(first)}\n\n`));

      const reader = upstream.getReader();
      let buf = "";
      try {
        while (true) {
          const { done: rDone, value } = await reader.read();
          if (rDone) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let evt: any;
            try { evt = JSON.parse(payload); } catch { continue; }
            const t = evt?.type;
            if (t === "response.output_text.delta" && typeof evt.delta === "string") {
              assistantText += evt.delta;
              const chunk = {
                id, object: "chat.completion.chunk", created, model: finalModel,
                choices: [{ index: 0, delta: { content: evt.delta }, finish_reason: null }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } else if (t === "response.completed") {
              const r = evt.response ?? {};
              finalModel = r.model || finalModel;
              usage = r.usage ?? usage;
            }
          }
        }
      } finally {
        const finalChunk = {
          id, object: "chat.completion.chunk", created, model: finalModel,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: usage ? {
            prompt_tokens: usage.input_tokens ?? 0,
            completion_tokens: usage.output_tokens ?? 0,
            total_tokens: usage.total_tokens ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)),
          } : undefined,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
        resolveDone({
          assistantText,
          usage: usage ? {
            prompt_tokens: usage.input_tokens ?? 0,
            completion_tokens: usage.output_tokens ?? 0,
          } : null,
          finalModel,
        });
      }
    },
  });
  return { stream, done };
}
