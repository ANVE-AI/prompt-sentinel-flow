// AnveGuard dashboard API. Authenticates with a Clerk session JWT and exposes
// CRUD for keys, policies, logs, and stats. Single function with action routing.
import { corsHeaders, json, service, verifyClerkJwt, bearer, ensureProfile,
  generateApiKey, sha256Hex, encryptString, decryptString, GLOBAL_DEFAULT_BLOCKED } from "../_shared/anveguard.ts";
import { PROVIDERS, getProvider, CUSTOM_SCHEMA, resolveCustomEndpoint,
  resolveEndpoint, sanitizeExtraHeaders, validateCustomUrl } from "../_shared/providers.ts";

// In-memory cache for /models responses (per provider+key, 5 min TTL).
const modelsCache = new Map<string, { models: string[]; exp: number }>();

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
            const arr: any[] = j?.data ?? j?.models ?? [];
            sample = arr.find((m) => m?.id || m?.name)?.id ?? arr[0]?.name ?? null;
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
          const arr: any[] = j?.data ?? j?.models ?? [];
          const ids = arr.map((m) => m?.id || m?.name).filter((x) => typeof x === "string");
          const models = ids.length > 0 ? ids : fallbackSuggestions;
          modelsCache.set(cacheKey, { models, exp: Date.now() + 5 * 60_000 });
          return json({ models, source: "live" });
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
        await sb.from("api_keys").update({ is_active: false }).eq("id", id).eq("user_id", userId);
        return json({ ok: true });
      }

      // =====================================================================
      // Custom endpoint management (separate from API keys)
      // =====================================================================
      case "list_endpoints": {
        const { data } = await sb.from("endpoints")
          .select("id,name,base_url,models_url,kind,auth_scheme,auth_header,extra_headers,model_suggestions,default_model,path_prefix,chat_path,models_path,response_format,created_at,updated_at,provider_key_encrypted")
          .eq("user_id", userId).order("created_at", { ascending: false });
        // Mask the encrypted key — return only a "has key" bool to the UI.
        const endpoints = (data ?? []).map((e: any) => {
          const { provider_key_encrypted, ...rest } = e;
          return { ...rest, has_key: !!provider_key_encrypted };
        });
        // Count keys per endpoint so the UI can show usage / warn before deleting.
        const { data: keyCounts } = await sb.from("api_keys")
          .select("endpoint_id").eq("user_id", userId).not("endpoint_id", "is", null);
        const counts: Record<string, number> = {};
        for (const r of keyCounts ?? []) {
          if (r.endpoint_id) counts[r.endpoint_id] = (counts[r.endpoint_id] ?? 0) + 1;
        }
        return json({
          endpoints: endpoints.map((e: any) => ({ ...e, key_count: counts[e.id] ?? 0 })),
        });
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
        // Test a saved endpoint by id (uses stored provider key) OR ad-hoc form values.
        const { id } = body;
        let cfg: any = body;
        let upstreamKey: string | null = body.provider_key || null;

        if (id) {
          const { data: row } = await sb.from("endpoints").select("*")
            .eq("id", id).eq("user_id", userId).maybeSingle();
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
        let pingUrl = resolved.models_url;
        if (upstreamKey && resolved.auth_scheme !== "none") {
          if (resolved.auth_scheme === "bearer") headers["Authorization"] = `Bearer ${upstreamKey}`;
          else if (resolved.auth_scheme === "x-api-key") headers["x-api-key"] = upstreamKey;
          else if (resolved.auth_scheme === "header") headers[resolved.auth_header] = upstreamKey;
          else if (resolved.auth_scheme === "query") {
            const u = new URL(pingUrl);
            u.searchParams.set(resolved.auth_header, upstreamKey);
            pingUrl = u.toString();
          }
        }
        if (resolved.kind === "anthropic" && !headers["anthropic-version"]) {
          headers["anthropic-version"] = "2023-06-01";
        }
        const t0 = Date.now();
        try {
          const r = await fetch(pingUrl, { headers });
          const text = await r.text();
          let sample: string | null = null;
          let count = 0;
          try {
            const j = JSON.parse(text);
            const arr: any[] = j?.data ?? j?.models ?? [];
            count = arr.length;
            sample = arr.find((m) => m?.id || m?.name)?.id ?? arr[0]?.name ?? null;
          } catch { /* not JSON */ }
          return json({
            ok: r.ok,
            status: r.status,
            latency_ms: Date.now() - t0,
            url: pingUrl,
            chat_url: resolved.url,
            response_format: resolved.response_format,
            sample_model: sample,
            model_count: count,
            error: r.ok ? null : text.slice(0, 300),
          });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
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
