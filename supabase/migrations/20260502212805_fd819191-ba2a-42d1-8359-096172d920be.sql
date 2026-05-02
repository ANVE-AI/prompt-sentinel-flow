
ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_behavioral boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS behavioral_action text NOT NULL DEFAULT 'flag',
  ADD COLUMN IF NOT EXISTS throttle_window_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS throttle_flag_threshold integer NOT NULL DEFAULT 10;

ALTER TABLE public.policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_behavioral_action_check;
ALTER TABLE public.policy_settings
  ADD CONSTRAINT policy_settings_behavioral_action_check
  CHECK (behavioral_action IN ('block','sanitize','flag'));

ALTER TABLE public.policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_throttle_window_check;
ALTER TABLE public.policy_settings
  ADD CONSTRAINT policy_settings_throttle_window_check
  CHECK (throttle_window_minutes BETWEEN 1 AND 1440 AND throttle_flag_threshold >= 0);

-- Speed up the throttle lookup: count recent flag/block rows per api_key.
CREATE INDEX IF NOT EXISTS request_logs_api_key_verdict_created_idx
  ON public.request_logs (api_key_id, created_at DESC)
  WHERE verdict IN ('flag', 'block');
