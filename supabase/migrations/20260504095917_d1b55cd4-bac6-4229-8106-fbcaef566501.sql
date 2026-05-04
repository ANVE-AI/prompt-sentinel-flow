CREATE OR REPLACE FUNCTION public._lov_store_service_role_key(_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _id uuid;
BEGIN
  -- Replace if exists
  DELETE FROM vault.secrets WHERE name = 'service_role_key';
  SELECT vault.create_secret(_key, 'service_role_key', 'pg_cron auth for edge functions') INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public._lov_store_service_role_key(text) FROM PUBLIC, anon, authenticated;