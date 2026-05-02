
ALTER TABLE public.policy_rules
  ADD COLUMN IF NOT EXISTS applies_to_intents text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.request_logs
  ADD COLUMN IF NOT EXISTS detected_intent text,
  ADD COLUMN IF NOT EXISTS intent_confidence numeric;

CREATE INDEX IF NOT EXISTS request_logs_detected_intent_idx
  ON public.request_logs (user_id, detected_intent)
  WHERE detected_intent IS NOT NULL;
