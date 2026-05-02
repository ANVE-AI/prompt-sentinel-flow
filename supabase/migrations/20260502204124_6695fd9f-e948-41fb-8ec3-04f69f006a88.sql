-- Per-key model aliases: rewrite client model -> upstream model (optionally pinned to a specific endpoint)
CREATE TABLE public.model_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  api_key_id UUID NOT NULL,
  alias TEXT NOT NULL,
  target_model TEXT NOT NULL,
  target_endpoint_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (api_key_id, alias)
);
CREATE INDEX idx_model_aliases_key ON public.model_aliases(api_key_id);
CREATE INDEX idx_model_aliases_user ON public.model_aliases(user_id);

ALTER TABLE public.model_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "model_aliases_no_anon" ON public.model_aliases AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "model_aliases_no_authenticated" ON public.model_aliases AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TRIGGER update_model_aliases_updated_at
  BEFORE UPDATE ON public.model_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Named routes: ordered chain of (endpoint, model) with fallback triggers
CREATE TABLE public.routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  fallback_on_5xx BOOLEAN NOT NULL DEFAULT true,
  fallback_on_429 BOOLEAN NOT NULL DEFAULT true,
  fallback_on_timeout BOOLEAN NOT NULL DEFAULT false,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE INDEX idx_routes_user ON public.routes(user_id);

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes_no_anon" ON public.routes AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "routes_no_authenticated" ON public.routes AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TRIGGER update_routes_updated_at
  BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ordered steps in a route
CREATE TABLE public.route_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  endpoint_id UUID NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, position)
);
CREATE INDEX idx_route_steps_route ON public.route_steps(route_id);

ALTER TABLE public.route_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "route_steps_no_anon" ON public.route_steps AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "route_steps_no_authenticated" ON public.route_steps AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);