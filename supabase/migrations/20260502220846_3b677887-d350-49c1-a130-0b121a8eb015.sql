ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS behavioral_churn_threshold integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS behavioral_persona_threshold integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS behavioral_encoding_ratio_step numeric NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS behavioral_length_multiplier numeric NOT NULL DEFAULT 8;