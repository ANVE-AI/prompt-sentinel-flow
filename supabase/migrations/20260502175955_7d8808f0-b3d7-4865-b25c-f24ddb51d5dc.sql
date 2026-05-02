-- Endpoints RLS hardening.
-- Architecture: Auth is Clerk; all access is brokered by the `dashboard` edge function
-- using the service role (which bypasses RLS). End users (anon/authenticated roles via PostgREST)
-- must NEVER touch this table directly because:
--   * provider_key_encrypted is sensitive (decryption key lives only in edge functions)
--   * cross-tenant isolation is enforced in code via the verified Clerk user id
--
-- We make this explicit with restrictive deny-all policies for anon and authenticated.
-- Service role bypasses RLS, so the dashboard edge function continues to work normally.

ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoints FORCE ROW LEVEL SECURITY;

-- Drop any prior placeholder policies if they exist
DROP POLICY IF EXISTS "Deny all to anon" ON public.endpoints;
DROP POLICY IF EXISTS "Deny all to authenticated" ON public.endpoints;
DROP POLICY IF EXISTS "endpoints_no_anon" ON public.endpoints;
DROP POLICY IF EXISTS "endpoints_no_authenticated" ON public.endpoints;

-- Restrictive policies: every action is denied for direct PostgREST clients.
-- All legitimate access flows through the `dashboard` edge function (service role).
CREATE POLICY "endpoints_no_anon"
  ON public.endpoints
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "endpoints_no_authenticated"
  ON public.endpoints
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);