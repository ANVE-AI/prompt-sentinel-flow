ALTER TABLE public.policy_templates
  ADD COLUMN IF NOT EXISTS applies_to_intents text[] NOT NULL DEFAULT '{}'::text[];