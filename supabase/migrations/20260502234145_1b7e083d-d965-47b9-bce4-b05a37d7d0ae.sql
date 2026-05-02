ALTER TABLE public.request_logs
  ADD COLUMN IF NOT EXISTS guardrail_prompt text,
  ADD COLUMN IF NOT EXISTS client_system_prompt text;