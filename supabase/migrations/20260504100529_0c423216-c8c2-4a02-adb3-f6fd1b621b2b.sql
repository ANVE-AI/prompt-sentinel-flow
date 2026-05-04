ALTER TABLE public.policy_settings
  ADD COLUMN IF NOT EXISTS log_retention_days INT NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS audit_log_retention_days INT NOT NULL DEFAULT 730;

ALTER TABLE public.policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_log_retention_days_check;
ALTER TABLE public.policy_settings
  ADD CONSTRAINT policy_settings_log_retention_days_check
  CHECK (log_retention_days BETWEEN 1 AND 3650);

ALTER TABLE public.policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_audit_log_retention_days_check;
ALTER TABLE public.policy_settings
  ADD CONSTRAINT policy_settings_audit_log_retention_days_check
  CHECK (audit_log_retention_days BETWEEN 30 AND 3650);

CREATE OR REPLACE FUNCTION public.prune_user_logs(_user_id TEXT)
RETURNS TABLE (request_logs_deleted INT, audit_logs_deleted INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _retention_days INT;
  _audit_retention_days INT;
  _logs_deleted INT;
  _audit_deleted INT;
BEGIN
  SELECT
    COALESCE(log_retention_days, 90),
    COALESCE(audit_log_retention_days, 730)
  INTO _retention_days, _audit_retention_days
  FROM public.policy_settings
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    _retention_days := 90;
    _audit_retention_days := 730;
  END IF;

  DELETE FROM public.request_logs
  WHERE user_id = _user_id
    AND created_at < now() - (_retention_days || ' days')::interval;
  GET DIAGNOSTICS _logs_deleted = ROW_COUNT;

  DELETE FROM public.audit_logs
  WHERE user_id = _user_id
    AND created_at < now() - (_audit_retention_days || ' days')::interval;
  GET DIAGNOSTICS _audit_deleted = ROW_COUNT;

  RETURN QUERY SELECT _logs_deleted, _audit_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_user_logs(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_user_logs(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_all_logs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user RECORD;
  _result RECORD;
  _summary JSONB := '{"users":0,"request_logs_deleted":0,"audit_logs_deleted":0,"started_at":null,"completed_at":null}'::jsonb;
  _users_count INT := 0;
  _logs_total INT := 0;
  _audit_total INT := 0;
BEGIN
  _summary := jsonb_set(_summary, '{started_at}', to_jsonb(now()::text));
  FOR _user IN SELECT user_id FROM public.policy_settings LOOP
    SELECT * INTO _result FROM public.prune_user_logs(_user.user_id);
    _users_count := _users_count + 1;
    _logs_total := _logs_total + COALESCE(_result.request_logs_deleted, 0);
    _audit_total := _audit_total + COALESCE(_result.audit_logs_deleted, 0);
  END LOOP;
  _summary := jsonb_set(_summary, '{users}', to_jsonb(_users_count));
  _summary := jsonb_set(_summary, '{request_logs_deleted}', to_jsonb(_logs_total));
  _summary := jsonb_set(_summary, '{audit_logs_deleted}', to_jsonb(_audit_total));
  _summary := jsonb_set(_summary, '{completed_at}', to_jsonb(now()::text));
  RETURN _summary;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_all_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_all_logs() TO service_role;