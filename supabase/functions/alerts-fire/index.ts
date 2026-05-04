// Alert firing engine (audit Sprint 9). Iterates all enabled
// alert_subscriptions, evaluates each kind's threshold against the
// relevant table window, and POSTs a signed JSON payload to the
// configured webhook when the threshold is tripped AND the cooldown
// has elapsed.
//
// Auth: requires Supabase service-role key in the Authorization header.
// Designed to be called by pg_cron (via pg_net.http_post) or by an
// operator's external scheduler. Not exposed to end users.
//
// Wire to pg_cron after deploy (operator runs once):
//
//   SELECT cron.schedule(
//     'anveguard-alerts',
//     '* * * * *',  -- every minute
//     $$
//       SELECT net.http_post(
//         url := 'https://<project>.supabase.co/functions/v1/alerts-fire',
//         headers := jsonb_build_object(
//           'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
//           'Content-Type',  'application/json'
//         ),
//         body := '{}'::jsonb
//       );
//     $$
//   );
//
// Idempotency: each subscription tracks `last_fired_at` and `cooldown_minutes`,
// so re-runs within the cooldown window are no-ops.

import { service } from "../_shared/anveguard.ts";
import { postWebhook } from "../_shared/webhook.ts";

interface AlertSubscription {
  id: string;
  user_id: string;
  name: string;
  kind: "block_spike" | "token_spike" | "audit_event";
  target_url: string;
  webhook_secret: string | null;
  threshold_value: number | null;
  threshold_window_minutes: number;
  audit_action_filter: string[] | null;
  cooldown_minutes: number;
  enabled: boolean;
  last_fired_at: string | null;
  fire_count: number;
}

function pastCooldown(sub: AlertSubscription): boolean {
  if (!sub.last_fired_at) return true;
  const last = Date.parse(sub.last_fired_at);
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= sub.cooldown_minutes * 60_000;
}

function sinceIso(windowMinutes: number): string {
  return new Date(Date.now() - windowMinutes * 60_000).toISOString();
}

/**
 * Evaluate a subscription against current data. Returns the trigger payload
 * if the threshold is tripped, otherwise null. The payload shape is stable
 * — receivers can switch on `kind` for type-narrowing.
 */
async function evaluate(
  sb: ReturnType<typeof service>,
  sub: AlertSubscription,
): Promise<Record<string, unknown> | null> {
  const since = sinceIso(sub.threshold_window_minutes);

  if (sub.kind === "block_spike") {
    const { count } = await sb.from("request_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", sub.user_id)
      .like("status", "blocked%")
      .gte("created_at", since);
    const blocked = count ?? 0;
    if (blocked < (sub.threshold_value ?? 0)) return null;
    return {
      kind: "block_spike",
      threshold_value: sub.threshold_value,
      window_minutes: sub.threshold_window_minutes,
      blocked_count: blocked,
    };
  }

  if (sub.kind === "token_spike") {
    const { data } = await sb.from("request_logs")
      .select("tokens_in,tokens_out")
      .eq("user_id", sub.user_id)
      .gte("created_at", since);
    const tokens = (data ?? []).reduce(
      (s: number, r: { tokens_in?: number | null; tokens_out?: number | null }) =>
        s + (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
      0,
    );
    if (tokens < (sub.threshold_value ?? 0)) return null;
    return {
      kind: "token_spike",
      threshold_value: sub.threshold_value,
      window_minutes: sub.threshold_window_minutes,
      tokens_total: tokens,
    };
  }

  if (sub.kind === "audit_event") {
    let q = sb.from("audit_logs")
      .select("id,action,target_type,target_id,metadata,created_at")
      .eq("user_id", sub.user_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    if (sub.audit_action_filter && sub.audit_action_filter.length > 0) {
      q = q.in("action", sub.audit_action_filter);
    }
    const { data } = await q;
    if (!data || data.length === 0) return null;
    return {
      kind: "audit_event",
      window_minutes: sub.threshold_window_minutes,
      filter: sub.audit_action_filter,
      events: data,
    };
  }

  return null;
}

Deno.serve(async (req) => {
  // Auth gate — accepts either the Supabase service-role key (operator
  // calling manually) or the rotating shared secret stored in the
  // `system_secrets` table (used by pg_cron via vault). MUST NOT be
  // reachable by end-user Clerk JWTs.
  const sb = service();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  let ok = !!serviceKey && provided === serviceKey;
  if (!ok && provided.length >= 32) {
    const { data: sec } = await sb.from("system_secrets")
      .select("value").eq("name", "alerts_fire_secret").maybeSingle();
    if (sec?.value && provided === sec.value) ok = true;
  }
  if (!ok) {
    return new Response(JSON.stringify({ error: "service-role auth required" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  const { data: subs, error } = await sb
    .from("alert_subscriptions")
    .select("*")
    .eq("enabled", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const summary = {
    started_at: new Date().toISOString(),
    examined: 0,
    fired: 0,
    skipped_cooldown: 0,
    no_trigger: 0,
    delivery_failures: 0,
    completed_at: "",
  };

  for (const raw of (subs ?? []) as AlertSubscription[]) {
    summary.examined += 1;
    if (!pastCooldown(raw)) { summary.skipped_cooldown += 1; continue; }
    const payload = await evaluate(sb, raw);
    if (!payload) { summary.no_trigger += 1; continue; }

    const fullPayload = {
      service: "anveguard",
      subscription_id: raw.id,
      subscription_name: raw.name,
      fired_at: new Date().toISOString(),
      ...payload,
    };
    const result = await postWebhook(raw.target_url, fullPayload, {
      secret: raw.webhook_secret,
      timeoutMs: 8_000,
    });

    if (result.ok) summary.fired += 1;
    else summary.delivery_failures += 1;

    // Always bump last_fired_at + count, even on delivery failure — the
    // intent was to fire, and the cooldown should still apply so we don't
    // hammer a flaky receiver.
    await sb.from("alert_subscriptions").update({
      last_fired_at: new Date().toISOString(),
      fire_count: raw.fire_count + 1,
    }).eq("id", raw.id);

    // Audit the fire event so operators can see delivery success/failure.
    await sb.from("audit_logs").insert({
      user_id: raw.user_id,
      actor_user_id: raw.user_id,
      action: result.ok ? "alert_subscription.fired" : "alert_subscription.fire_failed",
      target_type: "alert_subscription",
      target_id: raw.id,
      metadata: {
        kind: raw.kind,
        target_host: (() => { try { return new URL(raw.target_url).host; } catch { return null; } })(),
        delivery_status: result.status,
        delivery_ms: result.duration_ms,
        error: result.error ?? null,
      },
    });
  }

  summary.completed_at = new Date().toISOString();
  return new Response(JSON.stringify(summary), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
