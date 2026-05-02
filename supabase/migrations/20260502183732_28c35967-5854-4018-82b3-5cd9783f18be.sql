REVOKE EXECUTE ON FUNCTION public.claim_endpoint_shares(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_endpoint_shares(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_endpoint_shares(text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_endpoint_shares(text, text) TO service_role;