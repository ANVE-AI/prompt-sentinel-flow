// AnveGuard dashboard API. Authenticates with a Clerk session JWT and exposes
// CRUD for keys, policies, logs, and stats. Single function with action routing.
import { corsHeaders, json, service, verifyClerkJwt, bearer, ensureProfile,
  generateApiKey, sha256Hex, encryptString, decryptString, GLOBAL_DEFAULT_BLOCKED } from "../_shared/anveguard.ts";
import { PROVIDERS, getProvider, CUSTOM_SCHEMA, resolveCustomEndpoint,
  resolveEndpoint, sanitizeExtraHeaders, validateCustomUrl } from "../_shared/providers.ts";
import { parseModelsResponse } from "../_shared/models_parsers.ts";

// In-memory cache for /models responses (per provider+key, 5 min TTL).
const modelsCache = new Map<string, { models: string[]; exp: number }>();

/**
 * Look up an endpoint row that the caller is allowed to *read*. The caller is
 * allowed to read a row if either:
 *   1. They own it (`endpoints.user_id = userId`), OR
 *   2. The endpoint owner has explicitly shared it with them via `endpoint_shares`
 *      (matched on the resolved `shared_with_user_id`).
 *
 * Read access does NOT grant the right to mutate the row, mint API keys against
 * it, or see the encrypted provider key — callers of this helper must ONLY use
 * it for read/test/list-models flows. The encrypted key in the returned row is
 * meant to be decrypted server-side and used to call the upstream; it must never
 * be written into a response body.
 */
async function loadReadableEndpoint(
  sb: ReturnType<typeof service>, endpointId: string, userId: string,
): Promise<{ row: any | null; isShared: boolean }> {
  const { data: owned } = await sb.from("endpoints").select("*")
    .eq("id", endpointId).eq("user_id", userId).maybeSingle();
  if (owned) return { row: owned, isShared: false };

  const { data: share } = await sb.from("endpoint_shares")
    .select("endpoint_id").eq("endpoint_id", endpointId)
    .eq("shared_with_user_id", userId).maybeSingle();
  if (!share) return { row: null, isShared: false };

  const { data: shared } = await sb.from("endpoints").select("*")
    .eq("id", endpointId).maybeSingle();
  return { row: shared ?? null, isShared: !!shared };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = bearer(req);
    if (!token) return json({ error: "Missing auth" }, 401);
    const { sub: userId, email } = await verifyClerkJwt(token);
    await ensureProfile(userId, email);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (await safeJson(req))?.action;
    const body = req.method === "POST" || req.method === "PUT" ? await safeJson(req) : {};
    const sb = service();

    switch (action) {
      case "list_providers": {
        return json({ providers: PROVIDERS, custom_schema: CUSTOM_SCHEMA });
      }

      case "test_custom_endpoint": {
        // Validate the form values WITHOUT persisting. Pings the resolved /models URL.
        const { base_url, models_url, kind, auth_scheme, auth_header,
                extra_headers, provider_key } = body;
        if (!base_url) return json({ ok: false, error: "Base URL required" }, 400);
        let resolved;
        try {
          resolved = resolveCustomEndpoint({
            base_url, models_url, kind, auth_scheme,
            auth_header, extra_headers,
          });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
        }
        const headers: Record<string, string> = { Accept: "application/json", ...resolved.extra_headers };
        let pingUrl = resolved.models_url;
        if (provider_key && resolved.auth_scheme !== "none") {
          if (resolved.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${provider_key}`;
          else if (resolved.auth_scheme === "x-api-key") headers["x-api-key"] = provider_key;
          else if (resolved.auth_scheme === "header") headers[resolved.auth_header] = provider_key;
          else if (resolved.auth_scheme === "query") {
            const u = new URL(pingUrl);
            u.searchParams.set(resolved.auth_header, provider_key);
            pingUrl = u.toString();
          }
        }
        if (resolved.kind === "anthropic" && !headers["anthropic-version"]) {
          headers["anthropic-version"] = "2023-06-01";
        }
        try {
          const r = await fetch(pingUrl, { headers });
          const text = await r.text();
          let sample: string | null = null;
          try {
            const j = JSON.parse(text);
            const hint = resolved.kind === "anthropic" ? "anthropic" : null;
            const parsed = parseModelsResponse(j, hint);
            sample = parsed.ids[0] ?? null;
          } catch { /* not JSON */ }
          return json({
            ok: r.ok,
            status: r.status,
            url: resolved.models_url,
            chat_url: resolved.url,
            sample_model: sample,
            error: r.ok ? null : text.slice(0, 300),
          });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      case "list_models": {
        const { api_key_id } = body;
        if (!api_key_id) return json({ error: "api_key_id required" }, 400);
        const { data: keyRow } = await sb.from("api_keys")
          .select("id,user_id,provider,provider_key_encrypted,custom_base_url,custom_models_url,custom_kind,custom_auth_scheme,custom_auth_header,custom_extra_headers,custom_model_suggestions")
          .eq("id", api_key_id).eq("user_id", userId).maybeSingle();
        if (!keyRow) return json({ error: "Key not found" }, 404);

        // Resolve target URL + headers
        const upstreamKey = keyRow.provider_key_encrypted
          ? await decryptString(keyRow.provider_key_encrypted) : "";

        let resolvedUrl: string | undefined;
        let headers: Record<string, string> = { Accept: "application/json" };
        let fallbackSuggestions: string[] = [];

        if (keyRow.provider === "custom") {
          try {
            const r = resolveEndpoint(keyRow as any, upstreamKey || null);
            resolvedUrl = r.models_url;
            headers = { ...headers, ...r.headers };
          } catch (e) {
            return json({ error: e instanceof Error ? e.message : String(e) }, 400);
          }
          fallbackSuggestions = keyRow.custom_model_suggestions ?? [];
        } else {
          const def = getProvider(keyRow.provider);
          if (!def) return json({ error: "Unknown provider" }, 400);
          if (def.managed || !def.models_url) {
            return json({ models: def.model_suggestions, source: "static" });
          }
          resolvedUrl = def.models_url;
          if (def.kind === "anthropic") {
            if (upstreamKey) headers["x-api-key"] = upstreamKey;
            headers["anthropic-version"] = "2023-06-01";
          } else if (upstreamKey) {
            headers["Authorization"] = `Bearer ${upstreamKey}`;
          }
          fallbackSuggestions = def.model_suggestions;
        }

        const cacheKey = `${keyRow.provider}:${keyRow.custom_base_url ?? ""}:${keyRow.provider_key_encrypted ?? ""}`;
        const cached = modelsCache.get(cacheKey);
        if (cached && cached.exp > Date.now()) {
          return json({ models: cached.models, source: "cache" });
        }

        try {
          const r = await fetch(resolvedUrl!, { headers });
          if (!r.ok) {
            const txt = await r.text();
            return json({ models: fallbackSuggestions, source: "fallback", warning: `Upstream ${r.status}: ${txt.slice(0, 200)}` });
          }
          const j = await r.json();
          const hint = keyRow.provider === "custom"
            ? (keyRow.custom_kind === "anthropic" ? "anthropic"
                : (keyRow.custom_kind === "ollama" ? "ollama" : null))
            : (getProvider(keyRow.provider)?.kind === "anthropic" ? "anthropic" : null);
          const parsed = parseModelsResponse(j, hint);
          const models = parsed.ids.length > 0 ? parsed.ids : fallbackSuggestions;
          modelsCache.set(cacheKey, { models, exp: Date.now() + 5 * 60_000 });
          return json({ models, source: "live", shape: parsed.shape });
        } catch (e) {
          return json({ models: fallbackSuggestions, source: "fallback", warning: String(e) });
        }
      }

      case "list_keys": {
        const { data } = await sb.from("api_keys")
          .select("id,name,key_prefix,provider,model_default,is_active,created_at,last_used_at,custom_base_url,custom_kind")
          .eq("user_id", userId).order("created_at", { ascending: false });
        return json({ keys: data ?? [] });
      }

      case "create_key": {
        const { name, provider, model, provider_key, custom, endpoint_id } = body;
        const def = getProvider(provider);
        if (!name || !def) return json({ error: "Invalid provider" }, 400);

        const insert: Record<string, unknown> = {
          user_id: userId, name, provider,
          model_default: model || def.default_model || "",
        };

        if (provider === "custom") {
          // Two paths: (a) attach a saved endpoint via endpoint_id,
          //           (b) inline custom config (legacy / quick create).
          if (endpoint_id) {
            const { data: ep } = await sb.from("endpoints").select("*")
              .eq("id", endpoint_id).eq("user_id", userId).maybeSingle();
            if (!ep) return json({ error: "Endpoint not found" }, 404);
            insert.endpoint_id = ep.id;
            // Mirror the endpoint's config into custom_* cols so the proxy keeps
            // working from a single row read (no JOIN needed at request time).
            insert.custom_base_url = ep.base_url;
            insert.custom_models_url = ep.models_url;
            insert.custom_kind = ep.kind;
            insert.custom_auth_scheme = ep.auth_scheme;
            insert.custom_auth_header = ep.auth_header;
            insert.custom_extra_headers = ep.extra_headers ?? {};
            insert.custom_model_suggestions = ep.model_suggestions ?? [];
            insert.custom_path_prefix = ep.path_prefix ?? null;
            insert.custom_chat_path = ep.chat_path ?? null;
            insert.custom_models_path = ep.models_path ?? null;
            insert.custom_response_format = ep.response_format ?? null;
            insert.provider_key_encrypted = ep.provider_key_encrypted ?? null;
            if (!model && ep.default_model) insert.model_default = ep.default_model;
          } else {
            if (!custom || typeof custom !== "object") {
              return json({ error: "Custom endpoint config required" }, 400);
            }
            let resolved;
            try {
              resolved = resolveCustomEndpoint({
                base_url: custom.base_url,
                models_url: custom.models_url || null,
                kind: custom.kind,
                auth_scheme: custom.auth_scheme,
                auth_header: custom.auth_header || null,
                extra_headers: custom.extra_headers || null,
                path_prefix: custom.path_prefix || null,
                chat_path: custom.chat_path || null,
                models_path: custom.models_path || null,
                response_format: custom.response_format || null,
              });
            } catch (e) {
              return json({ error: e instanceof Error ? e.message : String(e) }, 400);
            }
            if (resolved.auth_scheme !== "none" && !provider_key) {
              return json({ error: "Provider API key required for selected auth scheme" }, 400);
            }
            insert.custom_base_url = custom.base_url;
            insert.custom_models_url = custom.models_url || null;
            insert.custom_kind = resolved.kind;
            insert.custom_auth_scheme = resolved.auth_scheme;
            insert.custom_auth_header = resolved.auth_header;
            insert.custom_extra_headers = sanitizeExtraHeaders(custom.extra_headers || null);
            insert.custom_path_prefix = custom.path_prefix || null;
            insert.custom_chat_path = custom.chat_path || null;
            insert.custom_models_path = custom.models_path || null;
            insert.custom_response_format = resolved.response_format;
            if (Array.isArray(custom.model_suggestions)) {
              insert.custom_model_suggestions = custom.model_suggestions
                .filter((x: unknown) => typeof x === "string" && x.trim())
                .map((x: string) => x.trim());
            }
            insert.provider_key_encrypted = provider_key ? await encryptString(provider_key) : null;
          }
        } else if (!def.managed && !provider_key) {
          return json({ error: `${def.label} key required` }, 400);
        } else if (!def.managed) {
          insert.provider_key_encrypted = await encryptString(provider_key);
        }

        const plain = generateApiKey();
        insert.key_hash = await sha256Hex(plain);
        insert.key_prefix = plain.slice(0, 16);

        const { data, error } = await sb.from("api_keys").insert(insert).select("id").single();
        if (error) return json({ error: error.message }, 400);
        return json({ id: data!.id, full_key: plain, key_prefix: insert.key_prefix });
      }

      case "revoke_key": {
        const { id } = body;
        // Read the key first so the audit entry can capture name/prefix even
        // if the row is later deleted. Scoped by user_id for ownership.
        const { data: keyRow } = await sb.from("api_keys")
          .select("id,name,key_prefix,provider,is_active,endpoint_id")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        if (!keyRow) return json({ error: "Key not found" }, 404);

        const { error: updErr } = await sb.from("api_keys")
          .update({ is_active: false }).eq("id", id).eq("user_id", userId);
        if (updErr) return json({ error: updErr.message }, 400);

        // Best-effort audit entry. Don't fail the revoke if logging fails — the
        // security action (disabling the key) already succeeded.
        const wasAlreadyRevoked = keyRow.is_active === false;
        await sb.from("audit_logs").insert({
          user_id: userId,
          actor_user_id: userId,
          action: "api_key.revoked",
          target_type: "api_key",
          target_id: id,
          metadata: {
            key_name: keyRow.name,
            key_prefix: keyRow.key_prefix,
            provider: keyRow.provider,
            endpoint_id: keyRow.endpoint_id,
            already_revoked: wasAlreadyRevoked,
          },
        });
        return json({ ok: true });
      }

      // ----- Live API key health check ---------------------------------------
      // Sends one or more real chat requests through the upstream the key is
      // bound to. With `parallel > 1` it fires N concurrent requests via
      // Promise.all so users can verify their key handles parallel model calls.
      // Bypasses /proxy so policy filters don't interfere with the diagnostic.
      case "test_api_key": {
        const { api_key_id, model: modelOverride, prompt: promptOverride, parallel: parallelRaw } = body;
        if (!api_key_id) return json({ error: "api_key_id required" }, 400);

        // Clamp parallel to a sane range so a single click can't spam upstream.
        const parallel = Math.max(1, Math.min(10, Number(parallelRaw) || 1));

        const { data: keyRow } = await sb.from("api_keys")
          .select("id,user_id,provider,is_active,model_default,provider_key_encrypted,custom_base_url,custom_models_url,custom_kind,custom_auth_scheme,custom_auth_header,custom_extra_headers,custom_path_prefix,custom_chat_path,custom_models_path,custom_response_format")
          .eq("id", api_key_id).eq("user_id", userId).maybeSingle();
        if (!keyRow) return json({ error: "Key not found" }, 404);
        if (!keyRow.is_active) return json({ ok: false, error: "This key has been revoked." }, 400);

        const def = keyRow.provider === "custom" ? null : getProvider(keyRow.provider);
        const isManaged = !!def?.managed;
        let upstreamKey = "";
        if (keyRow.provider_key_encrypted) {
          try { upstreamKey = await decryptString(keyRow.provider_key_encrypted); }
          catch { return json({ ok: false, error: "Failed to decrypt stored provider key." }, 500); }
        }
        if (!isManaged && !upstreamKey) {
          return json({ ok: false, error: "No upstream provider key is stored on this AnveGuard key." }, 400);
        }
        if (isManaged) upstreamKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

        let url: string;
        let format: "chat_completions" | "responses" | "anthropic_messages";
        let headers: Record<string, string> = { "Content-Type": "application/json" };
        try {
          const r = resolveEndpoint(keyRow as any, upstreamKey || null);
          url = r.url;
          format = r.response_format;
          headers = { ...headers, ...r.headers };
        } catch (e) {
          return json({ ok: false, error: `Endpoint resolution failed: ${e instanceof Error ? e.message : String(e)}` }, 400);
        }

        const model = (typeof modelOverride === "string" && modelOverride.trim())
          ? modelOverride.trim() : keyRow.model_default;
        const userPrompt = (typeof promptOverride === "string" && promptOverride.trim())
          ? promptOverride.trim() : "Reply with the single word: pong";

        // One independent attempt — used both for single-shot and parallel mode.
        // Returns a structured result; never throws (caller relies on Promise.all).
        const runOne = async (idx: number) => {
          // Vary prompt slightly per attempt so providers can't dedupe-cache responses.
          const prompt = parallel > 1 ? `${userPrompt} (#${idx + 1})` : userPrompt;
          let payload: any;
          if (format === "anthropic_messages") {
            payload = { model, max_tokens: 32, messages: [{ role: "user", content: prompt }] };
          } else if (format === "responses") {
            payload = { model, input: prompt, max_output_tokens: 32 };
          } else {
            payload = { model, max_tokens: 32, messages: [{ role: "user", content: prompt }] };
          }

          const t0 = Date.now();
          let upstream: Response;
          try {
            upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
          } catch (e) {
            return {
              index: idx, ok: false as const, stage: "network",
              latency_ms: Date.now() - t0,
              error: `Network error: ${e instanceof Error ? e.message : String(e)}`,
            };
          }
          const latency = Date.now() - t0;
          const text = await upstream.text();

          if (!upstream.ok) {
            let detail: any = text.slice(0, 600);
            try { detail = JSON.parse(text); } catch { /* keep as string */ }
            return {
              index: idx, ok: false as const, stage: "upstream",
              status: upstream.status, latency_ms: latency,
              error: `Upstream returned ${upstream.status}`, detail,
            };
          }

          let reply = "";
          let tokens_in: number | null = null;
          let tokens_out: number | null = null;
          try {
            const j = JSON.parse(text);
            if (format === "anthropic_messages") {
              reply = Array.isArray(j?.content)
                ? j.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
                : "";
              tokens_in = j?.usage?.input_tokens ?? null;
              tokens_out = j?.usage?.output_tokens ?? null;
            } else if (format === "responses") {
              reply = j?.output_text
                ?? (Array.isArray(j?.output)
                  ? j.output.flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join("")
                  : "");
              tokens_in = j?.usage?.input_tokens ?? null;
              tokens_out = j?.usage?.output_tokens ?? null;
            } else {
              reply = j?.choices?.[0]?.message?.content ?? "";
              tokens_in = j?.usage?.prompt_tokens ?? null;
              tokens_out = j?.usage?.completion_tokens ?? null;
            }
          } catch {
            reply = text.slice(0, 400);
          }

          return {
            index: idx, ok: true as const, stage: "upstream",
            status: upstream.status, latency_ms: latency,
            reply: typeof reply === "string" ? reply.slice(0, 400) : "",
            tokens_in, tokens_out,
          };
        };

        // Fire all attempts concurrently. Promise.all preserves per-index order
        // in the result array even though the requests resolve out of order.
        const wallStart = Date.now();
        const results = await Promise.all(Array.from({ length: parallel }, (_, i) => runOne(i)));
        const wallMs = Date.now() - wallStart;

        await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

        // Single-call response: keep the original flat shape for back-compat.
        if (parallel === 1) {
          const r = results[0];
          return json({
            ...r,
            model, format,
            target: { url, format, model },
          });
        }

        // Parallel response: aggregate stats + per-attempt detail.
        const okCount = results.filter((r) => r.ok).length;
        const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
        const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))];
        return json({
          ok: okCount === results.length,
          parallel: true,
          attempts: results.length,
          succeeded: okCount,
          failed: results.length - okCount,
          wall_ms: wallMs,                    // total elapsed time for the batch
          sum_latency_ms: latencies.reduce((a, b) => a + b, 0), // sum of individual call latencies
          min_latency_ms: latencies[0],
          max_latency_ms: latencies[latencies.length - 1],
          avg_latency_ms: avg,
          p95_latency_ms: p95,
          // Speedup > 1 means calls actually ran concurrently upstream
          // (rather than being serialized somewhere along the path).
          speedup: Math.round((latencies.reduce((a, b) => a + b, 0) / Math.max(wallMs, 1)) * 100) / 100,
          model, format,
          target: { url, format, model },
          results,
        });
      }

      // Custom endpoint management (separate from API keys)
      // =====================================================================
      case "list_endpoints": {
        // Returns two collections in one payload:
        //   - `endpoints`: rows the caller owns (full editable shape, no key material).
        //   - `shared_endpoints`: rows shared *with* the caller as read-only (also stripped
        //     of `provider_key_encrypted`, plus the owner's email for display).
        // Both shapes carry `is_shared` so the UI can render them in the same table.
        const ENDPOINT_COLS =
          "id,name,base_url,models_url,kind,auth_scheme,auth_header,extra_headers,model_suggestions,default_model,path_prefix,chat_path,models_path,response_format,created_at,updated_at,user_id,provider_key_encrypted";

        const { data: owned } = await sb.from("endpoints")
          .select(ENDPOINT_COLS)
          .eq("user_id", userId).order("created_at", { ascending: false });

        const ownedRows = (owned ?? []).map((e: any) => {
          const { provider_key_encrypted, user_id: _u, ...rest } = e;
          return { ...rest, has_key: !!provider_key_encrypted, is_shared: false, permission: "owner" as const };
        });

        // Shared-with-me: join via endpoint_shares.shared_with_user_id (back-filled on first login).
        const { data: shareRows } = await sb.from("endpoint_shares")
          .select("id,endpoint_id,owner_user_id,permission,created_at")
          .eq("shared_with_user_id", userId);

        let sharedRows: any[] = [];
        if (shareRows && shareRows.length > 0) {
          const epIds = shareRows.map((s: any) => s.endpoint_id);
          const { data: epData } = await sb.from("endpoints")
            .select(ENDPOINT_COLS).in("id", epIds);
          // Resolve owner emails in one round-trip.
          const ownerIds = Array.from(new Set((epData ?? []).map((r: any) => r.user_id)));
          const ownerEmailById: Record<string, string | null> = {};
          if (ownerIds.length) {
            const { data: profs } = await sb.from("profiles")
              .select("clerk_user_id,email").in("clerk_user_id", ownerIds);
            for (const p of profs ?? []) ownerEmailById[p.clerk_user_id] = p.email ?? null;
          }
          const shareById: Record<string, any> = {};
          for (const s of shareRows) shareById[s.endpoint_id] = s;
          sharedRows = (epData ?? []).map((e: any) => {
            const { provider_key_encrypted, user_id, ...rest } = e;
            const share = shareById[e.id];
            return {
              ...rest,
              has_key: !!provider_key_encrypted,
              is_shared: true,
              permission: (share?.permission ?? "read") as "read",
              share_id: share?.id ?? null,
              owner_email: ownerEmailById[user_id] ?? null,
              shared_at: share?.created_at ?? null,
            };
          });
        }

        // Count keys per endpoint so the UI can show usage / warn before deleting.
        // Only counts the caller's own keys against their own endpoints (recipients
        // cannot create keys against shared endpoints, so this is owner-scoped).
        const { data: keyCounts } = await sb.from("api_keys")
          .select("endpoint_id").eq("user_id", userId).not("endpoint_id", "is", null);
        const counts: Record<string, number> = {};
        for (const r of keyCounts ?? []) {
          if (r.endpoint_id) counts[r.endpoint_id] = (counts[r.endpoint_id] ?? 0) + 1;
        }

        return json({
          endpoints: ownedRows.map((e: any) => ({ ...e, key_count: counts[e.id] ?? 0 })),
          shared_endpoints: sharedRows,
        });
      }

      // ---------------------------------------------------------------
      // Endpoint sharing — owner grants read-only access to a teammate.
      // The caller must OWN the endpoint to add or remove a share.
      // Recipients consume shares implicitly via list_endpoints above.
      // ---------------------------------------------------------------
      case "list_endpoint_shares": {
        const { endpoint_id } = body;
        if (!endpoint_id || typeof endpoint_id !== "string") {
          return json({ error: "endpoint_id required" }, 400);
        }
        // Verify ownership before disclosing the share list (it contains emails).
        const { data: ep } = await sb.from("endpoints")
          .select("id").eq("id", endpoint_id).eq("user_id", userId).maybeSingle();
        if (!ep) return json({ error: "Endpoint not found" }, 404);

        const { data: shares } = await sb.from("endpoint_shares")
          .select("id,shared_with_email,shared_with_user_id,permission,created_at")
          .eq("endpoint_id", endpoint_id).order("created_at", { ascending: false });
        return json({ shares: shares ?? [] });
      }

      case "add_endpoint_share": {
        const { endpoint_id, email } = body;
        if (!endpoint_id || typeof endpoint_id !== "string") {
          return json({ error: "endpoint_id required" }, 400);
        }
        const raw = typeof email === "string" ? email.trim().toLowerCase() : "";
        // Minimal email validation — the upstream profile lookup tolerates anything,
        // but we want a clear error before we hit the unique constraint.
        if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
          return json({ error: "A valid email is required" }, 400);
        }
        // Verify ownership.
        const { data: ep } = await sb.from("endpoints")
          .select("id").eq("id", endpoint_id).eq("user_id", userId).maybeSingle();
        if (!ep) return json({ error: "Endpoint not found" }, 404);

        // Block self-share — look up caller's profile email and compare.
        const { data: ownerProfile } = await sb.from("profiles")
          .select("email").eq("clerk_user_id", userId).maybeSingle();
        if (ownerProfile?.email && ownerProfile.email.trim().toLowerCase() === raw) {
          return json({ error: "You can't share an endpoint with yourself" }, 400);
        }

        // Pre-resolve the recipient's Clerk id if they already have a profile.
        const { data: recipient } = await sb.from("profiles")
          .select("clerk_user_id").eq("email", raw).maybeSingle();

        const { data: inserted, error } = await sb.from("endpoint_shares")
          .upsert({
            endpoint_id,
            owner_user_id: userId,
            shared_with_email: raw,
            shared_with_user_id: recipient?.clerk_user_id ?? null,
            permission: "read",
          }, { onConflict: "endpoint_id,shared_with_email" })
          .select("id,shared_with_email,shared_with_user_id,permission,created_at")
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({
          share: inserted,
          // Tell the UI whether the recipient already has access today vs. will pick it
          // up the next time they sign in.
          recipient_known: !!recipient?.clerk_user_id,
        });
      }

      case "remove_endpoint_share": {
        const { share_id } = body;
        if (!share_id || typeof share_id !== "string") {
          return json({ error: "share_id required" }, 400);
        }
        // Only the endpoint owner may revoke. Filtering on owner_user_id is enough
        // because we always set it when inserting.
        const { error, count } = await sb.from("endpoint_shares")
          .delete({ count: "exact" })
          .eq("id", share_id).eq("owner_user_id", userId);
        if (error) return json({ error: error.message }, 400);
        if ((count ?? 0) === 0) return json({ error: "Share not found" }, 404);
        return json({ ok: true });
      }


      case "save_endpoint": {
        // Create or update. Pass `id` to update.
        const { id, name, base_url, models_url, kind, auth_scheme, auth_header,
                extra_headers, model_suggestions, default_model, provider_key,
                clear_provider_key,
                path_prefix, chat_path, models_path, response_format } = body;
        if (!name || !base_url) return json({ error: "Name and base URL required" }, 400);

        let resolved;
        try {
          resolved = resolveCustomEndpoint({
            base_url, models_url: models_url || null, kind,
            auth_scheme, auth_header: auth_header || null,
            extra_headers: extra_headers || null,
            path_prefix: path_prefix || null,
            chat_path: chat_path || null,
            models_path: models_path || null,
            response_format: response_format || null,
          });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 400);
        }

        const row: Record<string, unknown> = {
          user_id: userId,
          name: String(name).slice(0, 120),
          base_url: String(base_url),
          models_url: models_url || null,
          kind: resolved.kind,
          auth_scheme: resolved.auth_scheme,
          auth_header: resolved.auth_header,
          extra_headers: sanitizeExtraHeaders(extra_headers || null),
          model_suggestions: Array.isArray(model_suggestions)
            ? model_suggestions
                .filter((x: unknown) => typeof x === "string" && x.trim())
                .map((x: string) => x.trim())
            : [],
          default_model: default_model ? String(default_model).slice(0, 200) : null,
          path_prefix: path_prefix ? String(path_prefix).slice(0, 200) : null,
          chat_path: chat_path ? String(chat_path).slice(0, 200) : null,
          models_path: models_path ? String(models_path).slice(0, 200) : null,
          response_format: resolved.response_format,
        };

        if (provider_key) {
          row.provider_key_encrypted = await encryptString(provider_key);
        } else if (clear_provider_key) {
          row.provider_key_encrypted = null;
        }

        if (id) {
          // Update — keep existing key unless caller sent provider_key/clear flag.
          const { data, error } = await sb.from("endpoints")
            .update(row).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
          if (error) return json({ error: error.message }, 400);
          if (!data) return json({ error: "Endpoint not found" }, 404);
          return json({ id: data.id });
        } else {
          if (resolved.auth_scheme !== "none" && !provider_key) {
            return json({ error: "Provider API key required for selected auth scheme" }, 400);
          }
          const { data, error } = await sb.from("endpoints")
            .insert(row).select("id").single();
          if (error) return json({ error: error.message }, 400);
          return json({ id: data.id });
        }
      }

      case "delete_endpoint": {
        const { id } = body;
        if (!id) return json({ error: "id required" }, 400);
        // Check if any API key still references it
        const { count } = await sb.from("api_keys")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("endpoint_id", id);
        if ((count ?? 0) > 0) {
          return json({ error: `Cannot delete: ${count} API key(s) still use this endpoint. Revoke or migrate them first.` }, 400);
        }
        const { error } = await sb.from("endpoints").delete()
          .eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "test_endpoint": {
        // Deep test: validates URL resolution, auth scheme requirements, models listing,
        // and (optionally) a low-cost chat completion probe.
        const { id, probe_chat, probe_model } = body;
        let cfg: any = body;
        let upstreamKey: string | null = body.provider_key || null;
        let hasStoredKey = false;

        if (id) {
          // Allow shared recipients to test too — read-only, key never leaves the server.
          const { row } = await loadReadableEndpoint(sb, id, userId);
          if (!row) return json({ ok: false, error: "Endpoint not found" }, 404);
          cfg = {
            base_url: row.base_url, models_url: row.models_url,
            kind: row.kind, auth_scheme: row.auth_scheme,
            auth_header: row.auth_header, extra_headers: row.extra_headers,
            path_prefix: row.path_prefix, chat_path: row.chat_path,
            models_path: row.models_path, response_format: row.response_format,
            default_model: row.default_model,
          };
          hasStoredKey = !!row.provider_key_encrypted;
          if (row.provider_key_encrypted && !upstreamKey) {
            upstreamKey = await decryptString(row.provider_key_encrypted);
          }
        }

        const checks: { name: string; ok: boolean; detail?: string }[] = [];
        const addCheck = (name: string, ok: boolean, detail?: string) =>
          checks.push({ name, ok, detail });

        // ---------- Check 1: Base URL ----------
        if (!cfg.base_url) {
          addCheck("Base URL provided", false, "Missing base_url");
          return json({ ok: false, checks, error: "Base URL required" }, 400);
        }
        try {
          new URL(cfg.base_url);
          addCheck("Base URL valid", true, cfg.base_url);
        } catch {
          addCheck("Base URL valid", false, "Not a valid URL");
          return json({ ok: false, checks, error: "Invalid base_url" }, 400);
        }

        // ---------- Check 2: Auth scheme requirements ----------
        const scheme = cfg.auth_scheme || "bearer";
        const authHeaderName = (cfg.auth_header || "").trim();
        if (scheme === "none") {
          addCheck("Auth scheme: none", true, "No credentials required");
        } else {
          const keyAvailable = !!upstreamKey || hasStoredKey;
          if (!keyAvailable) {
            addCheck(`Auth scheme: ${scheme}`, false, "Provider key missing");
            return json({ ok: false, checks, error: `Auth scheme '${scheme}' requires a provider key` }, 400);
          }
          if ((scheme === "header" || scheme === "query") && !authHeaderName) {
            addCheck(
              `Auth scheme: ${scheme}`,
              false,
              `'${scheme}' requires a header/param name (auth_header)`,
            );
            return json({
              ok: false, checks,
              error: `Auth scheme '${scheme}' requires the header/param name to be set`,
            }, 400);
          }
          if (scheme === "bearer") addCheck("Auth: Bearer token", true, "Authorization: Bearer ***");
          else if (scheme === "x-api-key") addCheck("Auth: x-api-key", true, "x-api-key: ***");
          else if (scheme === "header") addCheck(`Auth: custom header`, true, `${authHeaderName}: ***`);
          else if (scheme === "query") addCheck(`Auth: query param`, true, `?${authHeaderName}=***`);
        }

        // ---------- Check 3: URL resolution ----------
        let resolved;
        try {
          resolved = resolveCustomEndpoint({
            base_url: cfg.base_url, models_url: cfg.models_url || null,
            kind: cfg.kind, auth_scheme: scheme,
            auth_header: cfg.auth_header || null,
            extra_headers: cfg.extra_headers || null,
            path_prefix: cfg.path_prefix || null,
            chat_path: cfg.chat_path || null,
            models_path: cfg.models_path || null,
            response_format: cfg.response_format || null,
          });
          addCheck("Resolved chat URL", true, resolved.url);
          addCheck("Resolved models URL", true, resolved.models_url);
        } catch (e) {
          addCheck("URL resolution", false, e instanceof Error ? e.message : String(e));
          return json({
            ok: false, checks,
            error: e instanceof Error ? e.message : String(e),
          }, 400);
        }

        // Build headers + URL with auth applied
        const buildAuthed = (rawUrl: string) => {
          const h: Record<string, string> = { Accept: "application/json", ...resolved.extra_headers };
          let url = rawUrl;
          if (upstreamKey && resolved.auth_scheme !== "none") {
            if (resolved.auth_scheme === "bearer") h["Authorization"] = `Bearer ${upstreamKey}`;
            else if (resolved.auth_scheme === "x-api-key") h["x-api-key"] = upstreamKey;
            else if (resolved.auth_scheme === "header") h[resolved.auth_header] = upstreamKey;
            else if (resolved.auth_scheme === "query") {
              const u = new URL(url);
              u.searchParams.set(resolved.auth_header, upstreamKey);
              url = u.toString();
            }
          }
          if (resolved.kind === "anthropic" && !h["anthropic-version"]) {
            h["anthropic-version"] = "2023-06-01";
          }
          return { headers: h, url };
        };

        // ---------- Check 4: Models listing ----------
        const { headers: listHeaders, url: pingUrl } = buildAuthed(resolved.models_url);
        const t0 = Date.now();
        let r: Response;
        try {
          r = await fetch(pingUrl, { headers: listHeaders });
        } catch (e) {
          addCheck("Models endpoint reachable", false, e instanceof Error ? e.message : String(e));
          return json({
            ok: false, checks, url: pingUrl,
            chat_url: resolved.url, response_format: resolved.response_format,
            error: `Network error: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
        const latency_ms = Date.now() - t0;
        const text = await r.text();
        addCheck(`Models HTTP ${r.status}`, r.ok, r.ok ? `${latency_ms}ms` : text.slice(0, 200));

        if (r.status === 401 || r.status === 403) {
          return json({
            ok: false, checks, status: r.status, latency_ms,
            url: pingUrl, chat_url: resolved.url,
            response_format: resolved.response_format,
            error: `Auth rejected (HTTP ${r.status}). Verify '${scheme}'${authHeaderName ? ` with '${authHeaderName}'` : ""} and key value. Upstream: ${text.slice(0, 200)}`,
          });
        }

        let sample: string | null = null;
        let count = 0;
        let modelIds: string[] = [];
        let parsedOk = false;
        let parsedShape: string | null = null;
        try {
          const j = JSON.parse(text);
          const hint = resolved.kind === "anthropic" ? "anthropic"
            : (resolved.kind === "ollama" ? "ollama" : null);
          const parsed = parseModelsResponse(j, hint);
          parsedOk = true;
          parsedShape = parsed.shape;
          modelIds = parsed.ids;
          count = modelIds.length;
          sample = modelIds[0] ?? null;
          addCheck("Parsed models JSON", true, `${count} model(s) found · shape: ${parsed.shape}`);
        } catch {
          addCheck("Parsed models JSON", false, "Upstream did not return JSON");
        }

        // ---------- Check 5: default_model present in upstream list ----------
        const defaultModel: string | undefined = cfg.default_model || undefined;
        if (defaultModel && parsedOk && count > 0) {
          const found = modelIds.includes(defaultModel);
          addCheck(
            `Default model "${defaultModel}" available`,
            found,
            found ? "Found in upstream list" : "Not in upstream list (may still work)",
          );
        }

        // ---------- Check 6 (optional): chat completion probe ----------
        let chatProbe: any = null;
        if (probe_chat && r.ok) {
          const probeModel = (probe_model && String(probe_model).trim())
            || defaultModel
            || sample
            || null;
          if (!probeModel) {
            addCheck("Chat probe", false, "No model available to probe");
          } else {
            const { headers: chatHeaders, url: chatUrl } = buildAuthed(resolved.url);
            chatHeaders["Content-Type"] = "application/json";
            const fmt = resolved.response_format || "chat_completions";
            let payload: any;
            if (fmt === "anthropic_messages") {
              payload = {
                model: probeModel, max_tokens: 8,
                messages: [{ role: "user", content: "ping" }],
              };
            } else if (fmt === "responses") {
              payload = { model: probeModel, input: "ping", max_output_tokens: 8 };
            } else {
              payload = {
                model: probeModel, max_tokens: 8,
                messages: [{ role: "user", content: "ping" }],
              };
            }
            const tc = Date.now();
            try {
              const cr = await fetch(chatUrl, {
                method: "POST", headers: chatHeaders, body: JSON.stringify(payload),
              });
              const ctext = await cr.text();
              chatProbe = {
                ok: cr.ok, status: cr.status,
                latency_ms: Date.now() - tc, model: probeModel,
                error: cr.ok ? null : ctext.slice(0, 300),
              };
              addCheck(
                `Chat probe (${fmt})`,
                cr.ok,
                cr.ok ? `${probeModel} · ${chatProbe.latency_ms}ms` : `HTTP ${cr.status}: ${ctext.slice(0, 160)}`,
              );
            } catch (e) {
              chatProbe = { ok: false, error: e instanceof Error ? e.message : String(e), model: probeModel };
              addCheck(`Chat probe (${fmt})`, false, chatProbe.error);
            }
          }
        }

        const allOk = checks.every((c) => c.ok);
        return json({
          ok: allOk,
          status: r.status,
          latency_ms,
          url: pingUrl,
          chat_url: resolved.url,
          response_format: resolved.response_format,
          sample_model: sample,
          model_count: count,
          checks,
          chat_probe: chatProbe,
          error: allOk ? null : (checks.find((c) => !c.ok)?.detail || text.slice(0, 300)),
        });
      }

      case "list_endpoint_models": {
        // Live "list models" for a custom endpoint — works for a saved endpoint by id
        // OR for ad-hoc form values (so users can preview models before saving).
        // Falls back to provided model_suggestions if the upstream call fails.
        const { id } = body;
        let cfg: any = body;
        let upstreamKey: string | null = body.provider_key || null;
        let fallback: string[] = Array.isArray(body.model_suggestions)
          ? body.model_suggestions.filter((s: unknown) => typeof s === "string" && s.trim())
          : [];

        if (id) {
          const { row } = await loadReadableEndpoint(sb, id, userId);
          if (!row) return json({ ok: false, error: "Endpoint not found" }, 404);
          cfg = {
            base_url: row.base_url, models_url: row.models_url,
            kind: row.kind, auth_scheme: row.auth_scheme,
            auth_header: row.auth_header, extra_headers: row.extra_headers,
            path_prefix: row.path_prefix, chat_path: row.chat_path,
            models_path: row.models_path, response_format: row.response_format,
          };
          if (row.provider_key_encrypted && !upstreamKey) {
            upstreamKey = await decryptString(row.provider_key_encrypted);
          }
          fallback = row.model_suggestions ?? [];
        }

        if (!cfg.base_url) return json({ ok: false, error: "Base URL required" }, 400);
        let resolved;
        try {
          resolved = resolveCustomEndpoint({
            base_url: cfg.base_url, models_url: cfg.models_url || null,
            kind: cfg.kind, auth_scheme: cfg.auth_scheme,
            auth_header: cfg.auth_header || null,
            extra_headers: cfg.extra_headers || null,
            path_prefix: cfg.path_prefix || null,
            chat_path: cfg.chat_path || null,
            models_path: cfg.models_path || null,
            response_format: cfg.response_format || null,
          });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
        }

        const headers: Record<string, string> = { Accept: "application/json", ...resolved.extra_headers };
        let listUrl = resolved.models_url;
        if (upstreamKey && resolved.auth_scheme !== "none") {
          if (resolved.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${upstreamKey}`;
          else if (resolved.auth_scheme === "x-api-key") headers["x-api-key"] = upstreamKey;
          else if (resolved.auth_scheme === "header") headers[resolved.auth_header] = upstreamKey;
          else if (resolved.auth_scheme === "query") {
            const u = new URL(listUrl);
            u.searchParams.set(resolved.auth_header, upstreamKey);
            listUrl = u.toString();
          }
        }
        if (resolved.kind === "anthropic" && !headers["anthropic-version"]) {
          headers["anthropic-version"] = "2023-06-01";
        }

        const t0 = Date.now();
        try {
          const r = await fetch(listUrl, { headers });
          const text = await r.text();
          if (!r.ok) {
            return json({
              ok: false, source: "fallback", models: fallback, url: listUrl,
              status: r.status, latency_ms: Date.now() - t0,
              error: text.slice(0, 300) || `HTTP ${r.status}`,
            });
          }
          let parsed;
          try {
            const j = JSON.parse(text);
            const hint = resolved.kind === "anthropic" ? "anthropic"
              : (resolved.kind === "ollama" ? "ollama" : null);
            parsed = parseModelsResponse(j, hint);
          } catch {
            return json({
              ok: false, source: "fallback", models: fallback, url: listUrl,
              latency_ms: Date.now() - t0,
              error: "Upstream did not return JSON",
            });
          }
          const models = parsed.ids;
          if (models.length === 0) {
            return json({
              ok: true, source: "fallback", models: fallback, url: listUrl,
              latency_ms: Date.now() - t0, shape: parsed.shape,
              warning: "Upstream returned 0 models — using fallback suggestions.",
            });
          }
          return json({
            ok: true, source: "live", models, url: listUrl,
            latency_ms: Date.now() - t0, shape: parsed.shape,
            // Include richer per-model metadata so the UI can show display names / context windows.
            model_details: parsed.models,
          });
        } catch (e) {
          return json({
            ok: false, source: "fallback", models: fallback, url: listUrl,
            latency_ms: Date.now() - t0,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      case "get_policies": {
        const { data } = await sb.from("policies").select("*").eq("user_id", userId).maybeSingle();
        return json({ policies: data, global_defaults: GLOBAL_DEFAULT_BLOCKED });
      }

      case "save_policies": {
        const { blocked_keywords, allowed_keywords, use_global_defaults, block_message } = body;
        await sb.from("policies").upsert({
          user_id: userId,
          blocked_keywords: Array.isArray(blocked_keywords) ? blocked_keywords : [],
          allowed_keywords: Array.isArray(allowed_keywords) ? allowed_keywords : [],
          use_global_defaults: !!use_global_defaults,
          block_message: block_message || "This request was blocked by your organization's AI policy.",
        }, { onConflict: "user_id" });
        return json({ ok: true });
      }

      // ---- Layered policy admin ------------------------------------------
      // Workspace-wide settings for the layered evaluator.
      case "get_policy_settings": {
        const { data } = await sb.from("policy_settings").select("*").eq("user_id", userId).maybeSingle();
        return json({
          settings: data ?? {
            user_id: userId,
            enable_normalizer: true,
            enable_patterns: true,
            enable_heuristics: true,
            enable_intent: false,
            intent_shadow_mode: true,
            strict_mode: false,
            workspace_purpose: null,
            enable_injection_guard: true,
            injection_action: "block",
            enable_behavioral: true,
            behavioral_action: "flag",
            throttle_window_minutes: 5,
            throttle_flag_threshold: 10,
            enable_fuzzy_keywords: true,
            enable_semantic_keywords: false,
            semantic_threshold: 0.78,
          },
          known_intents: [
            "jailbreak", "prompt_injection", "data_exfiltration",
            "off_topic", "tool_abuse", "harassment", "other",
          ],
        });
      }

      case "save_policy_settings": {
        const allowedKeys = [
          "enable_normalizer", "enable_patterns", "enable_heuristics",
          "enable_intent", "intent_shadow_mode", "strict_mode",
          "enable_injection_guard", "enable_behavioral",
          "enable_fuzzy_keywords", "enable_semantic_keywords",
        ] as const;
        const patch: Record<string, unknown> = { user_id: userId };
        for (const k of allowedKeys) {
          if (typeof body?.[k] === "boolean") patch[k] = body[k];
        }
        if ("workspace_purpose" in (body ?? {})) {
          const wp = body.workspace_purpose;
          patch.workspace_purpose = typeof wp === "string" && wp.trim() ? wp.trim().slice(0, 2000) : null;
        }
        if ("injection_action" in (body ?? {})) {
          const a = String(body.injection_action);
          if (!["block", "sanitize", "flag"].includes(a)) {
            return json({ error: "Invalid injection_action" }, 400);
          }
          patch.injection_action = a;
        }
        if ("behavioral_action" in (body ?? {})) {
          const a = String(body.behavioral_action);
          if (!["block", "sanitize", "flag"].includes(a)) {
            return json({ error: "Invalid behavioral_action" }, 400);
          }
          patch.behavioral_action = a;
        }
        if ("throttle_window_minutes" in (body ?? {})) {
          const n = Number(body.throttle_window_minutes);
          if (!Number.isInteger(n) || n < 1 || n > 1440) {
            return json({ error: "throttle_window_minutes must be an integer 1-1440" }, 400);
          }
          patch.throttle_window_minutes = n;
        }
        if ("throttle_flag_threshold" in (body ?? {})) {
          const n = Number(body.throttle_flag_threshold);
          if (!Number.isInteger(n) || n < 0 || n > 100000) {
            return json({ error: "throttle_flag_threshold must be a non-negative integer" }, 400);
          }
          patch.throttle_flag_threshold = n;
        }
        await sb.from("policy_settings").upsert(patch, { onConflict: "user_id" });
        return json({ ok: true });
      }

      // Per-intent action mapping (block / flag / allow + min_confidence).
      case "list_policy_intents": {
        const { data } = await sb.from("policy_intents").select("*").eq("user_id", userId).order("intent");
        return json({ intents: data ?? [] });
      }

      case "save_policy_intent": {
        const intent = String(body?.intent ?? "").trim();
        const action = String(body?.action ?? "flag");
        const minConf = Number(body?.min_confidence ?? 0.7);
        if (!intent) return json({ error: "intent is required" }, 400);
        if (!["block", "flag", "allow"].includes(action)) {
          return json({ error: "action must be block, flag, or allow" }, 400);
        }
        if (!Number.isFinite(minConf) || minConf < 0 || minConf > 1) {
          return json({ error: "min_confidence must be between 0 and 1" }, 400);
        }
        await sb.from("policy_intents").upsert({
          user_id: userId, intent, action, min_confidence: minConf,
        }, { onConflict: "user_id,intent" });
        return json({ ok: true });
      }

      // Pattern rules (regex + structural detectors), optionally scoped to
      // one or more detected intents.
      case "list_policy_rules": {
        const { data } = await sb.from("policy_rules").select("*").eq("user_id", userId).order("created_at", { ascending: false });
        return json({ rules: data ?? [] });
      }

      case "save_policy_rule": {
        const id = body?.id ? String(body.id) : null;
        const kind = String(body?.kind ?? "");
        const name = String(body?.name ?? "").trim();
        const severity = String(body?.severity ?? "high");
        const direction = String(body?.direction ?? "both");
        const enabled = body?.enabled !== false;
        const config = body?.config && typeof body.config === "object" ? body.config : {};
        const appliesToIntents = Array.isArray(body?.applies_to_intents)
          ? body.applies_to_intents.map((s: unknown) => String(s)).filter(Boolean)
          : [];
        if (!name) return json({ error: "name is required" }, 400);
        if (!["regex", "detector"].includes(kind)) return json({ error: "kind must be regex or detector" }, 400);
        if (!["low", "med", "high"].includes(severity)) return json({ error: "invalid severity" }, 400);
        if (!["input", "output", "both"].includes(direction)) return json({ error: "invalid direction" }, 400);
        // Validate regex compiles before persisting.
        if (kind === "regex") {
          const pattern = String(config.pattern ?? "");
          if (!pattern) return json({ error: "regex rule requires config.pattern" }, 400);
          try { new RegExp(pattern, String(config.flags ?? "i")); }
          catch (e) { return json({ error: `invalid regex: ${(e as Error).message}` }, 400); }
        }
        const row = {
          user_id: userId, name, kind, severity, direction, enabled, config,
          applies_to_intents: appliesToIntents,
        };
        if (id) {
          const { error } = await sb.from("policy_rules").update(row).eq("id", id).eq("user_id", userId);
          if (error) return json({ error: error.message }, 400);
          return json({ ok: true, id });
        }
        const { data, error } = await sb.from("policy_rules").insert(row).select("id").single();
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, id: data?.id });
      }

      case "delete_policy_rule": {
        const id = String(body?.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const { error } = await sb.from("policy_rules").delete().eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "list_logs": {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
        const status = url.searchParams.get("status");
        let q = sb.from("request_logs")
          .select("id,api_key_id,provider,model,status,block_reason,latency_ms,tokens_in,tokens_out,created_at,messages,response")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
        if (status && status !== "all") q = q.eq("status", status);
        const { data } = await q;
        const { data: keys } = await sb.from("api_keys").select("id,name").eq("user_id", userId);
        const keyMap = new Map((keys ?? []).map((k) => [k.id, k.name]));
        return json({ logs: (data ?? []).map((l) => ({ ...l, api_key_name: keyMap.get(l.api_key_id) ?? "—" })) });
      }

      // Audit trail of sensitive account actions (e.g. API key revocations).
      // Server-only table; the dashboard function is the sole writer/reader,
      // so this endpoint is the only way the UI surfaces these events.
      case "list_audit_logs": {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
        const action = url.searchParams.get("action");
        let q = sb.from("audit_logs")
          .select("id,action,target_type,target_id,actor_user_id,metadata,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
        if (action && action !== "all") q = q.eq("action", action);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 400);
        return json({ entries: data ?? [] });
      }

      case "stats": {
        const since = new Date(Date.now() - 14 * 86400000).toISOString();
        const { data: logs } = await sb.from("request_logs")
          .select("status,latency_ms,created_at").eq("user_id", userId).gte("created_at", since);
        const { data: keys } = await sb.from("api_keys")
          .select("id,is_active").eq("user_id", userId);
        const total = logs?.length ?? 0;
        const blocked = (logs ?? []).filter((l) => l.status?.startsWith("blocked")).length;
        const avgLatency = total ? Math.round((logs!.reduce((s, l) => s + (l.latency_ms ?? 0), 0)) / total) : 0;
        // Bucket by day
        const buckets: Record<string, { requests: number; blocked: number }> = {};
        for (let i = 13; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
          buckets[d] = { requests: 0, blocked: 0 };
        }
        for (const l of logs ?? []) {
          const d = l.created_at.slice(0, 10);
          if (buckets[d]) {
            buckets[d].requests++;
            if (l.status?.startsWith("blocked")) buckets[d].blocked++;
          }
        }
        const chart = Object.entries(buckets).map(([day, v]) => ({ day, ...v }));
        return json({
          total, blocked, avg_latency_ms: avgLatency,
          active_keys: (keys ?? []).filter((k) => k.is_active).length,
          total_keys: keys?.length ?? 0,
          chart,
        });
      }

      case "endpoint_usage": {
        // Returns, per custom endpoint owned by the user:
        //   - the API keys bound to it (id, name, prefix, active, last_used_at, created_at)
        //   - recent request_logs whose api_key_id resolves to one of those keys
        //   - aggregate counts (total requests, blocked, avg latency, last_request_at)
        // Optional `endpoint_id` filters to a single endpoint; otherwise returns all.
        // Optional `range` restricts both the recent list AND the aggregate
        // stats to a rolling window: "1h" | "24h" | "7d" | "30d" | "90d" | "all".
        const filterId = url.searchParams.get("endpoint_id") || body.endpoint_id || null;
        const limit = Math.min(Number(url.searchParams.get("limit") ?? body.limit ?? 25), 200);
        const rangeRaw = (url.searchParams.get("range") || body.range || "24h").toString();
        const RANGE_MS: Record<string, number | null> = {
          "1h": 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          "90d": 90 * 24 * 60 * 60 * 1000,
          "all": null,
        };
        const range = rangeRaw in RANGE_MS ? rangeRaw : "24h";
        const rangeMs = RANGE_MS[range];
        const sinceIso = rangeMs == null ? null : new Date(Date.now() - rangeMs).toISOString();

        let epQ = sb.from("endpoints")
          .select("id,name,base_url,kind,response_format,default_model,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false });
        if (filterId) epQ = epQ.eq("id", filterId);
        const { data: endpoints, error: epErr } = await epQ;
        if (epErr) return json({ error: epErr.message }, 400);
        if (!endpoints || endpoints.length === 0) {
          return json({ usage: [], range, since: sinceIso });
        }

        const epIds = endpoints.map((e: any) => e.id);

        // All API keys for this user that are bound to one of these endpoints.
        const { data: keys } = await sb.from("api_keys")
          .select("id,name,key_prefix,endpoint_id,is_active,last_used_at,created_at,model_default,custom_kind")
          .eq("user_id", userId).in("endpoint_id", epIds);

        const keysByEndpoint = new Map<string, any[]>();
        const keyIdToEndpoint = new Map<string, string>();
        const allKeyIds: string[] = [];
        for (const k of keys ?? []) {
          if (!k.endpoint_id) continue;
          if (!keysByEndpoint.has(k.endpoint_id)) keysByEndpoint.set(k.endpoint_id, []);
          keysByEndpoint.get(k.endpoint_id)!.push(k);
          keyIdToEndpoint.set(k.id, k.endpoint_id);
          allKeyIds.push(k.id);
        }

        // Recent logs for those keys, optionally restricted to the rolling
        // window. Pull a generous batch then bucket per endpoint. Cap at
        // ~1000 rows total to stay within Supabase row defaults.
        const fetchCap = Math.min(1000, Math.max(limit * Math.max(epIds.length, 1) * 4, 100));
        let logs: any[] = [];
        if (allKeyIds.length > 0) {
          let logsQ = sb.from("request_logs")
            .select("id,api_key_id,provider,model,status,block_reason,latency_ms,tokens_in,tokens_out,created_at")
            .eq("user_id", userId).in("api_key_id", allKeyIds)
            .order("created_at", { ascending: false })
            .limit(fetchCap);
          if (sinceIso) logsQ = logsQ.gte("created_at", sinceIso);
          const { data: rows } = await logsQ;
          logs = rows ?? [];
        }

        const keyNameById = new Map((keys ?? []).map((k: any) => [k.id, k.name]));
        const usage = endpoints.map((ep: any) => {
          const epKeys = keysByEndpoint.get(ep.id) ?? [];
          const epKeyIds = new Set(epKeys.map((k: any) => k.id));
          const epLogs = logs.filter((l) => l.api_key_id && epKeyIds.has(l.api_key_id));
          const total = epLogs.length;
          const blocked = epLogs.filter((l) => typeof l.status === "string" && l.status.startsWith("blocked")).length;
          const errored = epLogs.filter((l) => l.status === "error").length;
          const sumLatency = epLogs.reduce((s, l) => s + (l.latency_ms ?? 0), 0);
          const avg_latency_ms = total ? Math.round(sumLatency / total) : 0;
          const last_request_at = epLogs[0]?.created_at ?? null;
          const recent = epLogs.slice(0, limit).map((l) => ({
            ...l, api_key_name: keyNameById.get(l.api_key_id) ?? "—",
          }));

          // Per-model breakdown over the same windowed log set. Grouped by
          // `model` (rows missing a model id are bucketed as "(unknown)"),
          // sorted by request count desc, capped at 8 entries.
          const modelBuckets = new Map<string, {
            model: string;
            request_count: number;
            blocked_count: number;
            error_count: number;
            latency_sum: number;
            latency_n: number;
            tokens_in_total: number;
            tokens_out_total: number;
            last_request_at: string | null;
          }>();
          for (const l of epLogs) {
            const key = (typeof l.model === "string" && l.model.trim()) ? l.model : "(unknown)";
            let b = modelBuckets.get(key);
            if (!b) {
              b = {
                model: key, request_count: 0, blocked_count: 0, error_count: 0,
                latency_sum: 0, latency_n: 0, tokens_in_total: 0, tokens_out_total: 0,
                last_request_at: null,
              };
              modelBuckets.set(key, b);
            }
            b.request_count += 1;
            if (typeof l.status === "string" && l.status.startsWith("blocked")) b.blocked_count += 1;
            if (l.status === "error") b.error_count += 1;
            if (typeof l.latency_ms === "number") {
              b.latency_sum += l.latency_ms;
              b.latency_n += 1;
            }
            if (typeof l.tokens_in === "number") b.tokens_in_total += l.tokens_in;
            if (typeof l.tokens_out === "number") b.tokens_out_total += l.tokens_out;
            if (!b.last_request_at || (l.created_at && l.created_at > b.last_request_at)) {
              b.last_request_at = l.created_at ?? b.last_request_at;
            }
          }
          const top_models = Array.from(modelBuckets.values())
            .map((b) => ({
              model: b.model,
              request_count: b.request_count,
              blocked_count: b.blocked_count,
              error_count: b.error_count,
              avg_latency_ms: b.latency_n ? Math.round(b.latency_sum / b.latency_n) : 0,
              tokens_in_total: b.tokens_in_total,
              tokens_out_total: b.tokens_out_total,
              last_request_at: b.last_request_at,
            }))
            .sort((a, b) => b.request_count - a.request_count)
            .slice(0, 8);

          return {
            endpoint: ep,
            keys: epKeys.map((k: any) => ({
              id: k.id, name: k.name, key_prefix: k.key_prefix,
              is_active: k.is_active, last_used_at: k.last_used_at,
              created_at: k.created_at, model_default: k.model_default,
              custom_kind: k.custom_kind,
            })),
            stats: {
              key_count: epKeys.length,
              active_key_count: epKeys.filter((k: any) => k.is_active).length,
              request_count: total,
              blocked_count: blocked,
              error_count: errored,
              avg_latency_ms,
              last_request_at,
            },
            recent_requests: recent,
            top_models,
          };
        });

        return json({ usage, range, since: sinceIso });
      }

      case "endpoint_request_detail": {
        // Returns the full row for a single request_log, including the prompt
        // (`messages`) and `response` jsonb payloads. Owner-only: we double-
        // check that the log row belongs to the calling user, AND that the
        // associated api_key (if any) is bound to an endpoint the user owns.
        // Shared-with-me recipients are NOT granted log access here.
        const requestId = url.searchParams.get("request_id") || body.request_id;
        if (!requestId || typeof requestId !== "string") {
          return json({ error: "request_id required" }, 400);
        }
        const { data: log, error: logErr } = await sb
          .from("request_logs")
          .select("*")
          .eq("id", requestId)
          .eq("user_id", userId)
          .maybeSingle();
        if (logErr) return json({ error: logErr.message }, 400);
        if (!log) return json({ error: "Request not found" }, 404);

        // Extra ownership check via the api_key -> endpoint chain.
        if (log.api_key_id) {
          const { data: key } = await sb
            .from("api_keys")
            .select("id,endpoint_id,name,key_prefix")
            .eq("id", log.api_key_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (key?.endpoint_id) {
            const { data: ep } = await sb
              .from("endpoints")
              .select("id")
              .eq("id", key.endpoint_id)
              .eq("user_id", userId)
              .maybeSingle();
            if (!ep) return json({ error: "Request not found" }, 404);
          }
          (log as any).api_key_name = key?.name ?? null;
          (log as any).api_key_prefix = key?.key_prefix ?? null;
        }

        return json({ request: log });
      }

      case "set_endpoint_default_model": {
        // Persist `default_model` for a saved endpoint, but ONLY after re-validating
        // that the chosen model is actually present in a fresh upstream `/models`
        // listing. This guarantees we never silently save a model id that the
        // provider doesn't recognize. The caller may pass `force: true` to skip
        // upstream re-validation (used when the user explicitly opts in despite
        // the model not appearing in the live list).
        const { id, default_model, force } = body;
        if (!id || typeof id !== "string") return json({ error: "id required" }, 400);
        if (typeof default_model !== "string" || !default_model.trim()) {
          return json({ error: "default_model required" }, 400);
        }
        const chosen = default_model.trim().slice(0, 200);

        const { data: row } = await sb.from("endpoints").select("*")
          .eq("id", id).eq("user_id", userId).maybeSingle();
        if (!row) return json({ error: "Endpoint not found" }, 404);

        if (!force) {
          // Re-fetch the upstream models list and verify the chosen id is there.
          let resolved;
          try {
            resolved = resolveCustomEndpoint({
              base_url: row.base_url, models_url: row.models_url || null,
              kind: row.kind, auth_scheme: row.auth_scheme,
              auth_header: row.auth_header || null,
              extra_headers: row.extra_headers || null,
              path_prefix: row.path_prefix || null,
              chat_path: row.chat_path || null,
              models_path: row.models_path || null,
              response_format: row.response_format || null,
            });
          } catch (e) {
            return json({ error: e instanceof Error ? e.message : String(e) }, 400);
          }

          const headers: Record<string, string> = { Accept: "application/json", ...resolved.extra_headers };
          let listUrl = resolved.models_url;
          const upstreamKey = row.provider_key_encrypted
            ? await decryptString(row.provider_key_encrypted) : null;
          if (upstreamKey && resolved.auth_scheme !== "none") {
            if (resolved.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${upstreamKey}`;
            else if (resolved.auth_scheme === "x-api-key") headers["x-api-key"] = upstreamKey;
            else if (resolved.auth_scheme === "header") headers[resolved.auth_header] = upstreamKey;
            else if (resolved.auth_scheme === "query") {
              const u = new URL(listUrl);
              u.searchParams.set(resolved.auth_header, upstreamKey);
              listUrl = u.toString();
            }
          }
          if (resolved.kind === "anthropic" && !headers["anthropic-version"]) {
            headers["anthropic-version"] = "2023-06-01";
          }

          let resp: Response;
          try {
            resp = await fetch(listUrl, { headers });
          } catch (e) {
            return json({
              error: `Could not reach upstream to verify the model: ${e instanceof Error ? e.message : String(e)}`,
              code: "upstream_unreachable",
            }, 502);
          }
          const text = await resp.text();
          if (!resp.ok) {
            return json({
              error: `Upstream rejected the models request (HTTP ${resp.status}). ${text.slice(0, 200)}`,
              code: "upstream_error", status: resp.status,
            }, 502);
          }
          let parsed;
          try {
            const j = JSON.parse(text);
            const hint = resolved.kind === "anthropic" ? "anthropic"
              : (resolved.kind === "ollama" ? "ollama" : null);
            parsed = parseModelsResponse(j, hint);
          } catch {
            return json({
              error: "Upstream did not return JSON for /models — cannot verify the model.",
              code: "parse_failed",
            }, 502);
          }
          if (parsed.ids.length === 0) {
            return json({
              error: "Upstream returned 0 models — cannot verify the model.",
              code: "empty_list",
            }, 502);
          }
          if (!parsed.ids.includes(chosen)) {
            return json({
              error: `Model "${chosen}" was not found in the upstream list (${parsed.ids.length} models). Refresh the list or pass force=true to save anyway.`,
              code: "model_missing",
              available: parsed.ids.slice(0, 10),
            }, 400);
          }
        }

        const { error: upErr } = await sb.from("endpoints")
          .update({ default_model: chosen }).eq("id", id).eq("user_id", userId);
        if (upErr) return json({ error: upErr.message }, 400);
        return json({ ok: true, default_model: chosen, forced: !!force });
      }

      case "export_endpoints": {
        // Returns the user's endpoint configurations as a portable JSON document.
        // Provider keys are NEVER included in plain form. By default they are stripped
        // (`include_keys: "none"`). When `include_keys: "encrypted"` is requested we
        // emit the at-rest ciphertext (only restorable on this same project, since the
        // encryption secret stays server-side). We never return decrypted keys.
        const includeKeys = (body.include_keys === "encrypted") ? "encrypted" : "none";
        const idsFilter: string[] | null = Array.isArray(body.ids) && body.ids.length > 0
          ? body.ids.filter((x: unknown) => typeof x === "string")
          : null;

        let q = sb.from("endpoints")
          .select("id,name,base_url,models_url,kind,auth_scheme,auth_header,extra_headers,model_suggestions,default_model,path_prefix,chat_path,models_path,response_format,provider_key_encrypted,created_at,updated_at")
          .eq("user_id", userId).order("created_at", { ascending: true });
        if (idsFilter) q = q.in("id", idsFilter);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 400);

        const endpoints = (data ?? []).map((e: any) => {
          const base = {
            name: e.name,
            base_url: e.base_url,
            models_url: e.models_url,
            kind: e.kind,
            auth_scheme: e.auth_scheme,
            auth_header: e.auth_header,
            extra_headers: e.extra_headers ?? {},
            model_suggestions: e.model_suggestions ?? [],
            default_model: e.default_model,
            path_prefix: e.path_prefix,
            chat_path: e.chat_path,
            models_path: e.models_path,
            response_format: e.response_format,
            has_key: !!e.provider_key_encrypted,
          };
          if (includeKeys === "encrypted" && e.provider_key_encrypted) {
            return { ...base, provider_key_encrypted: e.provider_key_encrypted };
          }
          return base;
        });

        return json({
          format: "anveguard.endpoints",
          version: 1,
          exported_at: new Date().toISOString(),
          include_keys: includeKeys,
          count: endpoints.length,
          endpoints,
        });
      }

      case "import_endpoints": {
        // Restore endpoints from a previously-exported JSON document.
        // - Strategy: "skip" (default) keeps existing endpoints with the same name
        //             "rename" appends " (imported)" if name collides
        //             "overwrite" updates the existing same-name endpoint in place
        // - Provider keys: imported only when `provider_key_encrypted` is present and
        //   `accept_encrypted_keys: true` (encrypted blobs only restore on the same project).
        //   Plaintext provider keys in payloads are intentionally ignored.
        const payload = body.payload;
        if (!payload || typeof payload !== "object") {
          return json({ error: "Missing import payload" }, 400);
        }
        if (payload.format && payload.format !== "anveguard.endpoints") {
          return json({ error: `Unsupported format: ${payload.format}` }, 400);
        }
        if (payload.version && Number(payload.version) > 1) {
          return json({ error: `Unsupported export version: ${payload.version}` }, 400);
        }
        const items = Array.isArray(payload.endpoints) ? payload.endpoints : [];
        if (items.length === 0) return json({ imported: 0, skipped: 0, updated: 0, errors: [] });

        const strategy = ["skip", "rename", "overwrite"].includes(body.strategy) ? body.strategy : "skip";
        const acceptEncrypted = body.accept_encrypted_keys === true;

        // Existing endpoints for collision checks.
        const { data: existing } = await sb.from("endpoints")
          .select("id,name").eq("user_id", userId);
        const byName = new Map<string, string>();
        for (const e of existing ?? []) byName.set(e.name, e.id);

        const errors: { name?: string; error: string }[] = [];
        let imported = 0, skipped = 0, updated = 0;

        for (const raw of items) {
          if (!raw || typeof raw !== "object") {
            errors.push({ error: "Invalid entry (not an object)" });
            continue;
          }
          const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
          const base_url = typeof raw.base_url === "string" ? raw.base_url.trim() : "";
          if (!name || !base_url) {
            errors.push({ name, error: "Missing name or base_url" });
            continue;
          }

          // Normalize + validate via the same resolver used by save_endpoint.
          let resolved;
          try {
            resolved = resolveCustomEndpoint({
              base_url,
              models_url: raw.models_url || null,
              kind: raw.kind,
              auth_scheme: raw.auth_scheme,
              auth_header: raw.auth_header || null,
              extra_headers: raw.extra_headers || null,
              path_prefix: raw.path_prefix || null,
              chat_path: raw.chat_path || null,
              models_path: raw.models_path || null,
              response_format: raw.response_format || null,
            });
          } catch (e) {
            errors.push({ name, error: e instanceof Error ? e.message : String(e) });
            continue;
          }

          const row: Record<string, unknown> = {
            user_id: userId,
            name,
            base_url,
            models_url: raw.models_url || null,
            kind: resolved.kind,
            auth_scheme: resolved.auth_scheme,
            auth_header: resolved.auth_header,
            extra_headers: sanitizeExtraHeaders(raw.extra_headers || null),
            model_suggestions: Array.isArray(raw.model_suggestions)
              ? raw.model_suggestions
                  .filter((x: unknown) => typeof x === "string" && x.trim())
                  .map((x: string) => String(x).trim())
              : [],
            default_model: raw.default_model ? String(raw.default_model).slice(0, 200) : null,
            path_prefix: raw.path_prefix ? String(raw.path_prefix).slice(0, 200) : null,
            chat_path: raw.chat_path ? String(raw.chat_path).slice(0, 200) : null,
            models_path: raw.models_path ? String(raw.models_path).slice(0, 200) : null,
            response_format: resolved.response_format,
          };

          // Only accept already-encrypted keys, and only when explicitly opted in.
          // Plaintext keys in the payload are ignored on purpose.
          if (acceptEncrypted && typeof raw.provider_key_encrypted === "string" && raw.provider_key_encrypted.length > 0) {
            row.provider_key_encrypted = raw.provider_key_encrypted;
          }

          const collisionId = byName.get(name);
          try {
            if (collisionId) {
              if (strategy === "skip") { skipped++; continue; }
              if (strategy === "overwrite") {
                const { error } = await sb.from("endpoints")
                  .update(row).eq("id", collisionId).eq("user_id", userId);
                if (error) { errors.push({ name, error: error.message }); continue; }
                updated++; continue;
              }
              // rename
              let suffix = 2;
              let candidate = `${name} (imported)`;
              while (byName.has(candidate)) { candidate = `${name} (imported ${suffix++})`; }
              row.name = candidate;
            }
            const { data: ins, error } = await sb.from("endpoints")
              .insert(row).select("id,name").single();
            if (error) { errors.push({ name, error: error.message }); continue; }
            byName.set(ins.name, ins.id);
            imported++;
          } catch (e) {
            errors.push({ name, error: e instanceof Error ? e.message : String(e) });
          }
        }

        return json({ imported, updated, skipped, errors });
      }

      // ===================================================================
      // Model aliases (per-API-key nicknames -> upstream model id)
      // ===================================================================
      case "list_aliases": {
        const { api_key_id } = body;
        let q = sb.from("model_aliases").select("*").eq("user_id", userId)
          .order("alias", { ascending: true });
        if (api_key_id) q = q.eq("api_key_id", api_key_id);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, 400);
        return json({ aliases: data ?? [] });
      }

      case "save_alias": {
        const { id, api_key_id, alias, target_model, target_endpoint_id } = body ?? {};
        if (!api_key_id || !alias || !target_model) {
          return json({ error: "api_key_id, alias, and target_model are required" }, 400);
        }
        const aliasNorm = String(alias).trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9._\-:/]{0,63}$/.test(aliasNorm)) {
          return json({ error: "Alias must be 1–64 chars, lowercase, no spaces" }, 400);
        }
        // Verify ownership of the key
        const { data: key } = await sb.from("api_keys").select("id")
          .eq("id", api_key_id).eq("user_id", userId).maybeSingle();
        if (!key) return json({ error: "API key not found" }, 404);
        // Verify ownership of endpoint if provided
        if (target_endpoint_id) {
          const { data: ep } = await sb.from("endpoints").select("id")
            .eq("id", target_endpoint_id).eq("user_id", userId).maybeSingle();
          if (!ep) return json({ error: "Target endpoint not found" }, 404);
        }
        const row = {
          user_id: userId,
          api_key_id,
          alias: aliasNorm,
          target_model: String(target_model).trim(),
          target_endpoint_id: target_endpoint_id || null,
        };
        if (id) {
          const { error } = await sb.from("model_aliases").update(row)
            .eq("id", id).eq("user_id", userId);
          if (error) return json({ error: error.message }, 400);
          return json({ ok: true, id });
        }
        const { data, error } = await sb.from("model_aliases").insert(row)
          .select("id").single();
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, id: data!.id });
      }

      case "delete_alias": {
        const { id } = body ?? {};
        if (!id) return json({ error: "id required" }, 400);
        const { error } = await sb.from("model_aliases").delete()
          .eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      // ===================================================================
      // Routes (named, ordered fallback chains)
      // ===================================================================
      case "list_routes": {
        const { data: routes, error } = await sb.from("routes")
          .select("*").eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 400);
        const ids = (routes ?? []).map((r: any) => r.id);
        let stepsByRoute: Record<string, any[]> = {};
        if (ids.length > 0) {
          const { data: steps } = await sb.from("route_steps")
            .select("*").in("route_id", ids)
            .order("position", { ascending: true });
          for (const s of steps ?? []) {
            (stepsByRoute[s.route_id] ||= []).push(s);
          }
        }
        return json({
          routes: (routes ?? []).map((r: any) => ({ ...r, steps: stepsByRoute[r.id] ?? [] })),
        });
      }

      case "save_route": {
        const {
          id, name, description,
          fallback_on_5xx, fallback_on_429, fallback_on_timeout,
          timeout_ms, steps,
        } = body ?? {};
        if (!name || !String(name).trim()) return json({ error: "Name is required" }, 400);
        const nameNorm = String(name).trim();
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,63}$/.test(nameNorm)) {
          return json({ error: "Route name must be 1–64 chars (letters, digits, .-_ space)" }, 400);
        }
        if (!Array.isArray(steps) || steps.length === 0) {
          return json({ error: "At least one step is required" }, 400);
        }
        // Validate every endpoint belongs to the user
        const epIds = [...new Set(steps.map((s: any) => String(s.endpoint_id)).filter(Boolean))];
        if (epIds.length === 0) return json({ error: "Each step needs an endpoint" }, 400);
        const { data: owned } = await sb.from("endpoints")
          .select("id").eq("user_id", userId).in("id", epIds);
        const ownedSet = new Set((owned ?? []).map((e: any) => e.id));
        for (const s of steps) {
          if (!s.endpoint_id || !ownedSet.has(String(s.endpoint_id))) {
            return json({ error: "Step endpoint not found or not owned by you" }, 400);
          }
          if (!s.model || !String(s.model).trim()) {
            return json({ error: "Each step needs a model" }, 400);
          }
        }
        const routeRow = {
          user_id: userId,
          name: nameNorm,
          description: description ? String(description).slice(0, 500) : null,
          fallback_on_5xx: !!fallback_on_5xx,
          fallback_on_429: !!fallback_on_429,
          fallback_on_timeout: !!fallback_on_timeout,
          timeout_ms: Math.max(1000, Math.min(120000, Number(timeout_ms) || 30000)),
        };

        let routeId = id as string | undefined;
        if (routeId) {
          const { error } = await sb.from("routes").update(routeRow)
            .eq("id", routeId).eq("user_id", userId);
          if (error) return json({ error: error.message }, 400);
          // Replace steps wholesale (simpler than diffing)
          await sb.from("route_steps").delete().eq("route_id", routeId);
        } else {
          const { data: ins, error } = await sb.from("routes").insert(routeRow)
            .select("id").single();
          if (error) return json({ error: error.message }, 400);
          routeId = ins!.id;
        }
        const stepRows = steps.map((s: any, i: number) => ({
          route_id: routeId,
          position: i,
          endpoint_id: String(s.endpoint_id),
          model: String(s.model).trim(),
        }));
        const { error: stepErr } = await sb.from("route_steps").insert(stepRows);
        if (stepErr) return json({ error: stepErr.message }, 400);
        return json({ ok: true, id: routeId });
      }

      case "delete_route": {
        const { id } = body ?? {};
        if (!id) return json({ error: "id required" }, 400);
        const { error } = await sb.from("routes").delete()
          .eq("id", id).eq("user_id", userId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("dashboard error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function safeJson(req: Request): Promise<any> {
  try { return await req.clone().json(); } catch { return {}; }
}
