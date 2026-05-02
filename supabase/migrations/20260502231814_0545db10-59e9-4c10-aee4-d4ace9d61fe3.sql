ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS guardrail_system_prompt text;