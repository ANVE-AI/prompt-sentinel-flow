ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS token_spike_alert_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS token_spike_window_hours integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS token_spike_min_tokens integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS token_spike_ratio numeric NOT NULL DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS token_spike_webhook_url text;