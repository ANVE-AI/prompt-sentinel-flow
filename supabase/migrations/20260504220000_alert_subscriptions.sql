-- Alert subscriptions (audit Sprint 9). Operators register webhooks that
-- fire when block-rate or token-spike thresholds trip in their workspace,
-- or when a specific audit verb is emitted. Actual delivery happens via a
-- separate engine (pg_cron or trigger-based — to be added) that reads this
-- table and POSTs the payload. This migration just lands the data model.
--
-- Webhooks include an optional shared secret. When set, AnveGuard signs the
-- payload with HMAC-SHA256 in an `X-AnveGuard-Signature` header so the
-- receiver can verify authenticity. Without a secret the request is sent
-- plain — operators using public webhook services like Slack often don't
-- need a signature.

CREATE TABLE IF NOT EXISTS public.alert_subscriptions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT        NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  kind            TEXT        NOT NULL,
  target_url      TEXT        NOT NULL,
  -- Optional shared secret for HMAC-SHA256 payload signing. Stored encrypted
  -- in a future revision; plaintext for now (it's a webhook secret, not a
  -- credential to a 3rd-party API).
  webhook_secret  TEXT,
  -- Thresholds the firing engine consults. Semantics depend on `kind`:
  --   block_spike: fire when blocked_count >= threshold_value over the
  --                threshold_window_minutes window.
  --   token_spike: fire when tokens_in+tokens_out >= threshold_value over
  --                the window.
  --   audit_event: fire on every matching audit verb (threshold_value
  --                ignored). audit_action_filter (TEXT[] or NULL=all) picks
  --                which verbs trigger.
  threshold_value          INT,
  threshold_window_minutes INT  NOT NULL DEFAULT 5,
  audit_action_filter      TEXT[],
  -- Throttle so a single sustained burst doesn't flood the receiver.
  cooldown_minutes INT  NOT NULL DEFAULT 5,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  last_fired_at   TIMESTAMPTZ,
  fire_count      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validity constraints — guard against silly configurations at write time.
ALTER TABLE public.alert_subscriptions
  DROP CONSTRAINT IF EXISTS alert_subscriptions_kind_check;
ALTER TABLE public.alert_subscriptions
  ADD CONSTRAINT alert_subscriptions_kind_check
  CHECK (kind IN ('block_spike', 'token_spike', 'audit_event'));

ALTER TABLE public.alert_subscriptions
  DROP CONSTRAINT IF EXISTS alert_subscriptions_window_check;
ALTER TABLE public.alert_subscriptions
  ADD CONSTRAINT alert_subscriptions_window_check
  CHECK (threshold_window_minutes BETWEEN 1 AND 1440);

ALTER TABLE public.alert_subscriptions
  DROP CONSTRAINT IF EXISTS alert_subscriptions_cooldown_check;
ALTER TABLE public.alert_subscriptions
  ADD CONSTRAINT alert_subscriptions_cooldown_check
  CHECK (cooldown_minutes BETWEEN 0 AND 1440);

CREATE INDEX IF NOT EXISTS alert_subscriptions_user_idx
  ON public.alert_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS alert_subscriptions_enabled_kind_idx
  ON public.alert_subscriptions (enabled, kind) WHERE enabled = TRUE;

-- updated_at trigger so audit timing is honest.
CREATE OR REPLACE FUNCTION public.bump_alert_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_subscriptions_updated_at ON public.alert_subscriptions;
CREATE TRIGGER alert_subscriptions_updated_at
  BEFORE UPDATE ON public.alert_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.bump_alert_subscriptions_updated_at();

-- Defense in depth — RLS on, no user-facing policies. Service role only.
ALTER TABLE public.alert_subscriptions ENABLE ROW LEVEL SECURITY;
