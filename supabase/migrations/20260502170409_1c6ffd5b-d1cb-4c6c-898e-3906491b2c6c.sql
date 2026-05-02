-- AnveGuard schema. Auth is handled by Clerk; user_id stores the Clerk user id (text).
-- All app access goes through edge functions using the service role, so RLS is enabled
-- with NO user-facing policies (deny by default to anon/authenticated; service role bypasses RLS).

CREATE TABLE public.profiles (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('lovable','openai')),
  provider_key_encrypted TEXT,
  model_default TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.policies (
  user_id TEXT PRIMARY KEY REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  blocked_keywords TEXT[] NOT NULL DEFAULT '{}',
  allowed_keywords TEXT[] NOT NULL DEFAULT '{}',
  use_global_defaults BOOLEAN NOT NULL DEFAULT true,
  block_message TEXT NOT NULL DEFAULT 'This request was blocked by your organization''s AI policy.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT,
  messages JSONB,
  response JSONB,
  status TEXT NOT NULL CHECK (status IN ('allowed','blocked_input','blocked_output','error')),
  block_reason TEXT,
  latency_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_user_created ON public.request_logs(user_id, created_at DESC);
CREATE INDEX idx_logs_api_key ON public.request_logs(api_key_id);
ALTER TABLE public.request_logs ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER policies_updated_at BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();