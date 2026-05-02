-- Add per-endpoint request options: path prefixes, explicit paths, response format mapping.

ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS path_prefix text,
  ADD COLUMN IF NOT EXISTS chat_path text,
  ADD COLUMN IF NOT EXISTS models_path text,
  ADD COLUMN IF NOT EXISTS response_format text NOT NULL DEFAULT 'chat_completions';

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS custom_path_prefix text,
  ADD COLUMN IF NOT EXISTS custom_chat_path text,
  ADD COLUMN IF NOT EXISTS custom_models_path text,
  ADD COLUMN IF NOT EXISTS custom_response_format text;

-- Validate response_format values via a trigger (avoids CHECK on mutable code paths).
CREATE OR REPLACE FUNCTION public.validate_endpoint_response_format()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.response_format IS NOT NULL
     AND NEW.response_format NOT IN ('chat_completions', 'responses', 'anthropic_messages') THEN
    RAISE EXCEPTION 'Invalid response_format: %', NEW.response_format;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS endpoints_validate_response_format ON public.endpoints;
CREATE TRIGGER endpoints_validate_response_format
BEFORE INSERT OR UPDATE ON public.endpoints
FOR EACH ROW EXECUTE FUNCTION public.validate_endpoint_response_format();