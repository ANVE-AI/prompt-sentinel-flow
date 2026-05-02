ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS custom_base_url text,
  ADD COLUMN IF NOT EXISTS custom_models_url text,
  ADD COLUMN IF NOT EXISTS custom_kind text,
  ADD COLUMN IF NOT EXISTS custom_auth_scheme text,
  ADD COLUMN IF NOT EXISTS custom_auth_header text,
  ADD COLUMN IF NOT EXISTS custom_extra_headers jsonb,
  ADD COLUMN IF NOT EXISTS custom_model_suggestions text[];