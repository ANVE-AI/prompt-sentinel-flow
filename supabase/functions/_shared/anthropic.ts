// Translate between OpenAI Chat Completions shape and Anthropic Messages shape.
// Keeps AnveGuard's public surface uniformly OpenAI-compatible.

interface OAIMessage { role: string; content: any; name?: string }

export function openaiToAnthropicRequest(body: any) {
  const messages: OAIMessage[] = body.messages || [];
  const systemParts: string[] = [];
  const out: { role: "user" | "assistant"; content: any }[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(typeof m.content === "string" ? m.content : JSON.stringify(m.content));
    } else if (m.role === "user" || m.role === "assistant") {
      out.push({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) });
    }
  }
  return {
    model: body.model,
    system: systemParts.join("\n\n") || undefined,
    messages: out,
    max_tokens: body.max_tokens ?? 1024,
    temperature: body.temperature,
    top_p: body.top_p,
    stream: !!body.stream,
    stop_sequences: body.stop,
  };
}

export function anthropicToOpenAIResponse(a: any) {
  const text = (a.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  const finish = a.stop_reason === "end_turn" ? "stop"
    : a.stop_reason === "max_tokens" ? "length"
    : a.stop_reason === "stop_sequence" ? "stop"
    : "stop";
  return {
    id: a.id || `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: a.model,
    choices: [{
      index: 0,
      finish_reason: finish,
      message: { role: "assistant", content: text },
    }],
    usage: {
      prompt_tokens: a.usage?.input_tokens ?? 0,
      completion_tokens: a.usage?.output_tokens ?? 0,
      total_tokens: (a.usage?.input_tokens ?? 0) + (a.usage?.output_tokens ?? 0),
    },
  };
}

/** Wrap an Anthropic SSE stream into an OpenAI-compatible SSE stream. */
export function anthropicStreamToOpenAI(upstream: ReadableStream<Uint8Array>, model: string): {
  stream: ReadableStream<Uint8Array>;
  done: Promise<{ assistantText: string; usage: { prompt_tokens: number; completion_tokens: number } | null }>;
} {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let assistantText = "";
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
  let resolveDone!: (v: any) => void;
  const done = new Promise<any>((r) => (resolveDone = r));

  const chatId = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  function oaiChunk(delta: any, finish_reason: string | null = null) {
    return `data: ${JSON.stringify({
      id: chatId, object: "chat.completion.chunk", created, model,
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      let buf = "";
      controller.enqueue(encoder.encode(oaiChunk({ role: "assistant", content: "" })));
      try {
        while (true) {
          const { done: d, value } = await reader.read();
          if (d) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const ev = JSON.parse(payload);
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
                const t: string = ev.delta.text || "";
                assistantText += t;
                controller.enqueue(encoder.encode(oaiChunk({ content: t })));
              } else if (ev.type === "message_delta" && ev.usage) {
                usage = {
                  prompt_tokens: usage?.prompt_tokens ?? 0,
                  completion_tokens: ev.usage.output_tokens ?? 0,
                };
              } else if (ev.type === "message_start" && ev.message?.usage) {
                usage = {
                  prompt_tokens: ev.message.usage.input_tokens ?? 0,
                  completion_tokens: 0,
                };
              }
            } catch { /* ignore */ }
          }
        }
        controller.enqueue(encoder.encode(oaiChunk({}, "stop")));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
        resolveDone({ assistantText, usage });
      }
    },
  });

  return { stream, done };
}
