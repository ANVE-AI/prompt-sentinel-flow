ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS severity_baseline_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS severity_volume_dampening numeric NOT NULL DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS severity_score_cap integer NOT NULL DEFAULT 100;