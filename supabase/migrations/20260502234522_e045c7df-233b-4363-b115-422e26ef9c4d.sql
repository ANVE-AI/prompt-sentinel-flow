ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS allow_client_system_prompt boolean NOT NULL DEFAULT false;