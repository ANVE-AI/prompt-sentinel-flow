
ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_injection_guard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS injection_action text NOT NULL DEFAULT 'block';

ALTER TABLE public.policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_injection_action_check;
ALTER TABLE public.policy_settings
  ADD CONSTRAINT policy_settings_injection_action_check
  CHECK (injection_action IN ('block','sanitize','flag'));
