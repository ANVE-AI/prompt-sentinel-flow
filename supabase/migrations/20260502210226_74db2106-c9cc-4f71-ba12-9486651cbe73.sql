-- Workspace-level toggles for the new layered evaluator.
CREATE TABLE public.policy_settings (
  user_id text PRIMARY KEY,
  enable_normalizer boolean NOT NULL DEFAULT true,
  enable_patterns boolean NOT NULL DEFAULT true,
  enable_heuristics boolean NOT NULL DEFAULT true,
  enable_intent boolean NOT NULL DEFAULT false,
  intent_shadow_mode boolean NOT NULL DEFAULT true,
  strict_mode boolean NOT NULL DEFAULT false,
  workspace_purpose text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.policy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_settings_no_anon" ON public.policy_settings AS RESTRICTIVE
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "policy_settings_no_authenticated" ON public.policy_settings AS RESTRICTIVE
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER policy_settings_updated_at BEFORE UPDATE ON public.policy_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Typed rules (regex + structural detectors).
CREATE TABLE public.policy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  kind text NOT NULL, -- 'regex' | 'detector'
  name text NOT NULL,
  -- regex: { pattern, flags }
  -- detector: { detector: 'system_prompt_leak'|'tool_injection'|'credential_shape'|'url_exfil'|'role_impersonation'|'pseudo_system_block'|'encoded_density', config? }
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'high', -- 'low' | 'med' | 'high'
  direction text NOT NULL DEFAULT 'both', -- 'input' | 'output' | 'both'
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX policy_rules_user_idx ON public.policy_rules (user_id, enabled);
ALTER TABLE public.policy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_rules_no_anon" ON public.policy_rules AS RESTRICTIVE
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "policy_rules_no_authenticated" ON public.policy_rules AS RESTRICTIVE
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER policy_rules_updated_at BEFORE UPDATE ON public.policy_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Intent → action mapping.
CREATE TABLE public.policy_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  intent text NOT NULL, -- jailbreak|prompt_injection|data_exfiltration|off_topic|tool_abuse|harassment|other
  action text NOT NULL DEFAULT 'flag', -- 'block' | 'flag' | 'allow'
  min_confidence numeric NOT NULL DEFAULT 0.7,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, intent)
);
ALTER TABLE public.policy_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy_intents_no_anon" ON public.policy_intents AS RESTRICTIVE
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "policy_intents_no_authenticated" ON public.policy_intents AS RESTRICTIVE
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER policy_intents_updated_at BEFORE UPDATE ON public.policy_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-key rolling behavior profile.
CREATE TABLE public.key_behavior_profiles (
  api_key_id uuid PRIMARY KEY,
  user_id text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  sample_count integer NOT NULL DEFAULT 0,
  prompt_len_mean numeric NOT NULL DEFAULT 0,
  prompt_len_m2 numeric NOT NULL DEFAULT 0, -- Welford state
  encoded_ratio_mean numeric NOT NULL DEFAULT 0,
  top_models jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.key_behavior_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "key_behavior_profiles_no_anon" ON public.key_behavior_profiles AS RESTRICTIVE
  FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "key_behavior_profiles_no_authenticated" ON public.key_behavior_profiles AS RESTRICTIVE
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Extend request_logs with verdict fields so flagged requests are queryable.
ALTER TABLE public.request_logs
  ADD COLUMN IF NOT EXISTS verdict text,            -- 'allow' | 'flag' | 'block'
  ADD COLUMN IF NOT EXISTS verdict_layers jsonb;    -- [{layer, verdict, reason, score}]
CREATE INDEX IF NOT EXISTS request_logs_verdict_idx ON public.request_logs (user_id, verdict, created_at DESC);