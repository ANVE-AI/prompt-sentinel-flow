CREATE TABLE IF NOT EXISTS public.system_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_secrets_no_anon ON public.system_secrets
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY system_secrets_no_authenticated ON public.system_secrets
  AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);