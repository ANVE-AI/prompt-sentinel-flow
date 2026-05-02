ALTER TABLE public.policy_templates
  ADD COLUMN IF NOT EXISTS unknown_intent_fallback text NOT NULL DEFAULT 'apply_no_rules';

ALTER TABLE public.policy_template_versions
  ADD COLUMN IF NOT EXISTS unknown_intent_fallback text NOT NULL DEFAULT 'apply_no_rules';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_templates_unknown_intent_fallback_check'
  ) THEN
    ALTER TABLE public.policy_templates
      ADD CONSTRAINT policy_templates_unknown_intent_fallback_check
      CHECK (unknown_intent_fallback IN ('apply_no_rules', 'apply_default_rules', 'reject'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'policy_template_versions_unknown_intent_fallback_check'
  ) THEN
    ALTER TABLE public.policy_template_versions
      ADD CONSTRAINT policy_template_versions_unknown_intent_fallback_check
      CHECK (unknown_intent_fallback IN ('apply_no_rules', 'apply_default_rules', 'reject'));
  END IF;
END $$;