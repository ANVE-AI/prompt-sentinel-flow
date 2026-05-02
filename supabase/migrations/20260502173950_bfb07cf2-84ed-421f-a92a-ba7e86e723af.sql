CREATE TABLE IF NOT EXISTS public.endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  base_url text NOT NULL,
  models_url text,
  kind text NOT NULL DEFAULT 'openai_compatible',
  auth_scheme text NOT NULL DEFAULT 'bearer',
  auth_header text,
  provider_key_encrypted text,
  extra_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_suggestions text[] NOT NULL DEFAULT '{}'::text[],
  default_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_endpoints_user_id ON public.endpoints(user_id);

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS endpoint_id uuid REFERENCES public.endpoints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_endpoint_id ON public.api_keys(endpoint_id);

DROP TRIGGER IF EXISTS endpoints_set_updated_at ON public.endpoints;
CREATE TRIGGER endpoints_set_updated_at
  BEFORE UPDATE ON public.endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();