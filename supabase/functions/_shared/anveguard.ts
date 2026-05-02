// Shared helpers for AnveGuard edge functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-clerk-auth",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export function service() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Cache JWKS per-issuer
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verify a Clerk session JWT and return the user id (sub). */
export async function verifyClerkJwt(token: string): Promise<{ sub: string; email?: string }> {
  // Decode header/payload without verifying to discover the issuer
  const [, payloadB64] = token.split(".");
  if (!payloadB64) throw new Error("Invalid token");
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  const issuer: string | undefined = payload.iss;
  if (!issuer || !issuer.startsWith("https://")) throw new Error("Invalid issuer");

  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    jwksCache.set(issuer, jwks);
  }
  const { payload: verified } = await jwtVerify(token, jwks, { issuer });
  return { sub: String(verified.sub), email: (verified as any).email };
}

/** Read Bearer token from Authorization header. */
export function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

/** Ensure a profile row exists for this Clerk user. */
export async function ensureProfile(userId: string, email?: string) {
  const sb = service();
  await sb.from("profiles").upsert({ clerk_user_id: userId, email: email ?? null }, { onConflict: "clerk_user_id" });
  // Ensure default policies row
  await sb.from("policies").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  // Back-fill any pending endpoint shares created before this user signed in
  // (matches by lower-cased email and stamps in the resolved Clerk id).
  if (email) {
    try {
      await sb.rpc("claim_endpoint_shares", { _user_id: userId, _email: email });
    } catch {
      // Non-fatal — sharing UI will retry next login.
    }
  }
}

// === API key generation / hashing ===

const enc = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "0").replace(/\//g, "0").replace(/=/g, "");
  return `ag_live_${b64}`;
}

// === AES-GCM encrypt/decrypt for stored OpenAI keys ===

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("KEY_ENCRYPTION_SECRET");
  if (!secret) throw new Error("KEY_ENCRYPTION_SECRET not set");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptString(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptString(payload: string): Promise<string> {
  const key = await getKey();
  const bin = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = bin.slice(0, 12);
  const ct = bin.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// === Policy engine ===

export const GLOBAL_DEFAULT_BLOCKED = [
  "ignore previous instructions",
  "ignore all previous",
  "system prompt",
  "jailbreak",
  "DAN mode",
];

export function checkPolicy(
  text: string,
  blocked: string[],
  allowed: string[],
): { blocked: boolean; matched?: string } {
  const lower = text.toLowerCase();
  for (const term of blocked) {
    const t = term.trim().toLowerCase();
    if (!t) continue;
    if (lower.includes(t)) {
      // allowlist override
      const allowedHit = allowed.some((a) => a.trim() && lower.includes(a.trim().toLowerCase()));
      if (allowedHit) continue;
      return { blocked: true, matched: term };
    }
  }
  return { blocked: false };
}
