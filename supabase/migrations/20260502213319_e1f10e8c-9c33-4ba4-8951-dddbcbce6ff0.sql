
ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_fuzzy_keywords boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_semantic_keywords boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS semantic_threshold numeric NOT NULL DEFAULT 0.78;

ALTER TABLE public.policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_semantic_threshold_check;
ALTER TABLE public.policy_settings
  ADD CONSTRAINT policy_settings_semantic_threshold_check
  CHECK (semantic_threshold BETWEEN 0.5 AND 0.95);
