-- Endpoint sharing: read-only access to a custom endpoint, granted by its owner.
CREATE TABLE public.endpoint_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint_id uuid NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  shared_with_email text NOT NULL,
  shared_with_user_id text NULL,
  permission text NOT NULL DEFAULT 'read' CHECK (permission IN ('read')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT endpoint_shares_email_lower CHECK (shared_with_email = lower(shared_with_email)),
  CONSTRAINT endpoint_shares_unique UNIQUE (endpoint_id, shared_with_email)
);

CREATE INDEX endpoint_shares_endpoint_id_idx   ON public.endpoint_shares (endpoint_id);
CREATE INDEX endpoint_shares_owner_id_idx      ON public.endpoint_shares (owner_user_id);
CREATE INDEX endpoint_shares_email_idx         ON public.endpoint_shares (shared_with_email);
CREATE INDEX endpoint_shares_recipient_id_idx  ON public.endpoint_shares (shared_with_user_id);

ALTER TABLE public.endpoint_shares ENABLE ROW LEVEL SECURITY;

-- Match the deny-all pattern used by `endpoints`. All access is mediated by the
-- dashboard edge function using the service role.
CREATE POLICY endpoint_shares_no_anon
  ON public.endpoint_shares
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY endpoint_shares_no_authenticated
  ON public.endpoint_shares
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Called from the edge function on first sign-in to associate any pending
-- shares (created before the recipient existed) with their newly seen Clerk id.
CREATE OR REPLACE FUNCTION public.claim_endpoint_shares(_user_id text, _email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF _user_id IS NULL OR _email IS NULL OR length(trim(_email)) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.endpoint_shares
     SET shared_with_user_id = _user_id
   WHERE shared_with_email = lower(trim(_email))
     AND (shared_with_user_id IS NULL OR shared_with_user_id <> _user_id);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;