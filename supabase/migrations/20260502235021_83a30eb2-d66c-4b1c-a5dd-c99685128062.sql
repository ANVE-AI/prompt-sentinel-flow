ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS system_prompt_max_length integer NOT NULL DEFAULT 16000;

DO $$ BEGIN
  ALTER TABLE public.policy_settings
    ADD CONSTRAINT policy_settings_system_prompt_max_length_range
    CHECK (system_prompt_max_length BETWEEN 100 AND 64000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;