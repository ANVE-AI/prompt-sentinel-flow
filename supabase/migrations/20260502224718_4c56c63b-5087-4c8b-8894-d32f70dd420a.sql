CREATE TABLE public.policy_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  description text,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.policy_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy_templates_no_anon" ON public.policy_templates AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "policy_templates_no_authenticated" ON public.policy_templates AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE INDEX idx_policy_templates_user ON public.policy_templates(user_id, created_at DESC);

CREATE TRIGGER update_policy_templates_updated_at
BEFORE UPDATE ON public.policy_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();