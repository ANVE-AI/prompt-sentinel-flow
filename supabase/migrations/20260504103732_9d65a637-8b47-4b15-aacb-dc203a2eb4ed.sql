ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_pii_detection BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pii_action TEXT NOT NULL DEFAULT 'sanitize';

ALTER TABLE public.policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_pii_action_check;

ALTER TABLE public.policy_settings
  ADD CONSTRAINT policy_settings_pii_action_check
  CHECK (pii_action IN ('block','sanitize','flag'));