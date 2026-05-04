-- Rate limit buckets — used by the proxy edge function to throttle abusive
-- callers (e.g. brute-forcing API keys). One row per (scope, key) pair, where
-- `scope` is e.g. 'proxy_auth_fail' and `key` is the caller's IP. Counts reset
-- when `window_start` ages out beyond `window_seconds` from the current call.
--
-- All access is service-role only — RLS denies anon/authenticated. Counter
-- updates are done via a single `increment_rate_limit` RPC for atomicity
-- (read-modify-write in app code would race under load).

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  scope         TEXT        NOT NULL,
  key           TEXT        NOT NULL,
  count         INT         NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour',
  PRIMARY KEY (scope, key)
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_expires_idx
  ON public.rate_limit_buckets (expires_at);

-- Defense in depth: enable RLS even though only service role accesses this.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — service role bypasses RLS, everyone else denied.

-- Atomic increment-with-window-rollover. Returns the post-increment count and
-- when the current window expires. Caller decides whether `count > limit`
-- means "block".
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  _scope          TEXT,
  _key            TEXT,
  _window_seconds INT
)
RETURNS TABLE (count INT, window_start TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now TIMESTAMPTZ := now();
BEGIN
  INSERT INTO public.rate_limit_buckets (scope, key, count, window_start, expires_at)
  VALUES (_scope, _key, 1, _now, _now + (_window_seconds || ' seconds')::interval)
  ON CONFLICT (scope, key) DO UPDATE SET
    count = CASE
      -- Window has rolled over: reset to 1.
      WHEN public.rate_limit_buckets.window_start < _now - (_window_seconds || ' seconds')::interval
        THEN 1
      -- Same window: increment.
      ELSE public.rate_limit_buckets.count + 1
    END,
    window_start = CASE
      WHEN public.rate_limit_buckets.window_start < _now - (_window_seconds || ' seconds')::interval
        THEN _now
      ELSE public.rate_limit_buckets.window_start
    END,
    expires_at = _now + (_window_seconds || ' seconds')::interval
  RETURNING public.rate_limit_buckets.count, public.rate_limit_buckets.window_start
  INTO count, window_start;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_rate_limit(TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(TEXT, TEXT, INT) TO service_role;

-- Periodic cleanup of expired buckets (call from pg_cron or app-side reaper).
-- Returns the number of rows deleted.
CREATE OR REPLACE FUNCTION public.prune_rate_limit_buckets()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INT;
BEGIN
  DELETE FROM public.rate_limit_buckets WHERE expires_at < now();
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_rate_limit_buckets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_rate_limit_buckets() TO service_role;
