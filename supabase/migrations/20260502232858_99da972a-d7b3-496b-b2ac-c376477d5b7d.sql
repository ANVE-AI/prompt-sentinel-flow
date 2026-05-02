CREATE TABLE IF NOT EXISTS public.known_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  label text,
  description text,
  examples text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.known_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "known_intents_no_anon" ON public.known_intents
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "known_intents_no_authenticated" ON public.known_intents
  AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TRIGGER known_intents_updated_at
  BEFORE UPDATE ON public.known_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();