ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS enable_compression boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compression_level text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS compression_min_chars integer NOT NULL DEFAULT 400;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS compression_mode text NOT NULL DEFAULT 'inherit';

ALTER TABLE public.request_logs
  ADD COLUMN IF NOT EXISTS tokens_saved_estimate integer,
  ADD COLUMN IF NOT EXISTS compression_applied boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'policy_settings_compression_level_chk') THEN
    ALTER TABLE public.policy_settings
      ADD CONSTRAINT policy_settings_compression_level_chk
      CHECK (compression_level IN ('light','balanced','aggressive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_compression_mode_chk') THEN
    ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_compression_mode_chk
      CHECK (compression_mode IN ('inherit','off','light','balanced','aggressive'));
  END IF;
END $$;