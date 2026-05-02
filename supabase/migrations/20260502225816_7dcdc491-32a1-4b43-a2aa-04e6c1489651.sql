
ALTER TABLE public.policy_templates
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.policy_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.policy_templates(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  description text,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  applies_to_intents text[] NOT NULL DEFAULT '{}'::text[],
  change_note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_template_versions_template
  ON public.policy_template_versions (template_id, version DESC);

ALTER TABLE public.policy_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy_template_versions_no_anon"
  ON public.policy_template_versions AS RESTRICTIVE
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "policy_template_versions_no_authenticated"
  ON public.policy_template_versions AS RESTRICTIVE
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
