CREATE TABLE IF NOT EXISTS public.alert_subscriptions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT        NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  kind            TEXT        NOT NULL,
  target_url      TEXT        NOT NULL,
  webhook_secret  TEXT,
  threshold_value          INT,
  threshold_window_minutes INT  NOT NULL DEFAULT 5,
  audit_action_filter      TEXT[],
  cooldown_minutes INT  NOT NULL DEFAULT 5,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  last_fired_at   TIMESTAMPTZ,
  fire_count      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE OR REPLACE FUNCTION public.bump_alert_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alert_subscriptions_updated_at ON public.alert_subscriptions;
CREATE TRIGGER alert_subscriptions_updated_at
  BEFORE UPDATE ON public.alert_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.bump_alert_subscriptions_updated_at();

ALTER TABLE public.alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY alert_subscriptions_no_anon ON public.alert_subscriptions
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY alert_subscriptions_no_authenticated ON public.alert_subscriptions
  AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);