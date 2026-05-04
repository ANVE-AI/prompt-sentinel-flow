// Webhook delivery helpers for alert subscriptions (Sprint 9 firing engine).
//
// HMAC-SHA256 signing matches the convention used by GitHub, Stripe, and
// Linear: an `X-AnveGuard-Signature` header carrying `sha256=<hex>` over the
// raw request body. Receivers verify by re-computing the HMAC with the
// shared secret. Optional — when no secret is configured we just POST plain.

const enc = new TextEncoder();

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DeliveryResult {
  ok: boolean;
  status: number | null;
  duration_ms: number;
  error?: string;
}

/**
 * POST a JSON payload to a webhook target with a strict timeout. Caller is
 * responsible for SSRF-validating `url` BEFORE calling this — we fetch it
 * directly. (Validation happened at save_alert_subscription time.)
 */
export async function postWebhook(
  url: string,
  payload: unknown,
  opts: { secret?: string | null; timeoutMs?: number } = {},
): Promise<DeliveryResult> {
  const start = Date.now();
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AnveGuard/1.0 (+https://github.com/ANVE-AI/prompt-sentinel-flow)",
  };
  if (opts.secret) {
    headers["X-AnveGuard-Signature"] = `sha256=${await hmacSha256Hex(opts.secret, body)}`;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8_000);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    return { ok: res.ok, status: res.status, duration_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, status: null, duration_ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}
