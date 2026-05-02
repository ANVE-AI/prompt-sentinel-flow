/**
 * Shared response-shape detector + parser for proxy interactions.
 *
 * The proxy can answer in two shapes for a single endpoint:
 *   - SSE stream (`text/event-stream`) for streaming chat completions
 *   - Plain JSON (`application/json`) for non-streaming responses, errors,
 *     and — importantly — *blocked* requests (proxy returns JSON 200 even
 *     when the client asked for `stream: true`).
 *
 * Anywhere we hit the proxy we must apply the same content-type-driven
 * decision so blocked responses never get mistaken for an empty stream.
 */

export type ProxyShape = "sse" | "json";

export interface ProxyVerdict {
  blocked: boolean;
  reason?: string;
  verdict?: string;
  layers?: any[];
  detectedIntent?: string;
  intentConfidence?: number;
}

export interface ProxyJsonResult extends ProxyVerdict {
  shape: "json";
  ok: boolean;
  status: number;
  text: string;
  data: any;
}

export interface ProxySseHandlers {
  onDelta?: (chunk: string, accumulated: string) => void;
  onVerdict?: (v: ProxyVerdict) => void;
}

export interface ProxySseResult extends ProxyVerdict {
  shape: "sse";
  ok: boolean;
  status: number;
  text: string;
}

/**
 * Inspect a Response and decide which parsing path to take. We trust
 * `content-type` over what the *client* requested, since the proxy may
 * downgrade `stream: true` to a JSON payload (e.g. on blocks/errors).
 */
export function detectProxyShape(res: Response): ProxyShape {
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("text/event-stream") ? "sse" : "json";
}

function extractVerdict(av: any): ProxyVerdict {
  if (!av || typeof av !== "object") return { blocked: false };
  return {
    blocked: !!av.blocked,
    reason: av.reason,
    verdict: av.blocked ? (av.verdict ?? "block") : av.verdict,
    layers: av.layers,
    detectedIntent: av.detected_intent,
    intentConfidence: av.intent_confidence,
  };
}

/** Parse a non-SSE proxy response (success, error, or blocked-as-JSON). */
export async function parseProxyJson(res: Response): Promise<ProxyJsonResult> {
  const raw = await res.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
  const verdict = extractVerdict(data?.anveguard);
  const text =
    data?.choices?.[0]?.message?.content ??
    data?.error?.message ??
    raw;
  return {
    shape: "json",
    ok: res.ok,
    status: res.status,
    text,
    data,
    ...verdict,
    verdict: verdict.verdict ?? (res.ok ? "allow" : undefined),
  };
}

/** Parse an SSE stream and emit deltas + final verdict. */
export async function parseProxySse(
  res: Response,
  handlers: ProxySseHandlers = {},
): Promise<ProxySseResult> {
  const base: ProxySseResult = {
    shape: "sse", ok: res.ok, status: res.status,
    text: "", blocked: false, verdict: "allow",
  };
  if (!res.body) return base;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", acc = "";
  let verdict: ProxyVerdict = { blocked: false };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload);
        const delta = obj?.choices?.[0]?.delta?.content;
        if (typeof delta === "string") {
          acc += delta;
          handlers.onDelta?.(delta, acc);
        }
        if (obj?.anveguard) {
          const v = extractVerdict(obj.anveguard);
          verdict = { ...verdict, ...v, blocked: verdict.blocked || v.blocked };
          handlers.onVerdict?.(verdict);
        }
        if (obj?.choices?.[0]?.finish_reason === "content_filter") {
          verdict.blocked = true;
        }
      } catch { /* partial frame */ }
    }
  }

  return {
    ...base,
    text: acc,
    ...verdict,
    verdict: verdict.blocked ? (verdict.verdict ?? "block") : "allow",
  };
}

/**
 * One-shot helper: pick JSON vs SSE based on the actual response shape.
 * Callers can still pass `onDelta` for streaming UIs; it's ignored when
 * the proxy answers with JSON (e.g. blocked input).
 */
export async function readProxyResponse(
  res: Response,
  handlers: ProxySseHandlers = {},
): Promise<ProxyJsonResult | ProxySseResult> {
  return detectProxyShape(res) === "sse"
    ? parseProxySse(res, handlers)
    : parseProxyJson(res);
}
