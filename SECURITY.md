# Security policy

AnveGuard is a security product. We take vulnerability reports seriously.

## Reporting a vulnerability

**Do not file a public GitHub issue for a security report.**

Email **security@anve.ai** with:
- A description of the vulnerability
- Steps to reproduce (or a proof-of-concept)
- The affected version / commit SHA
- Your assessment of impact and severity

We will acknowledge receipt within **2 business days** and aim to triage within **5 business days**. Critical issues get a fix and disclosure timeline within **14 days**; lower-severity issues are scheduled into the next maintenance window.

If you do not receive a response, please retry — never assume silence means the issue is being handled.

## Scope

In scope:
- The Supabase edge functions in `supabase/functions/proxy` and `supabase/functions/dashboard`
- The React dashboard in `src/`
- Database schema and RLS in `supabase/migrations/`
- Build and CI pipeline

Out of scope:
- Findings against an unsupported branch (only `main` is supported)
- Issues requiring physical access to a user's device
- Social engineering of operators
- Denial of service against a single proxy account using its own valid key (rate-limit yourself)

## Security model (one-page summary)

AnveGuard is multi-tenant. Isolation depends on three layers:

1. **Auth at the edge.** The `proxy` function validates `Authorization: Bearer ag_live_*` against the `api_keys` table (SHA-256 hash compare). The `dashboard` function validates a Clerk session JWT via JWKS. Neither function trusts requests with a missing or malformed token.
2. **Application-level row scoping.** Every database read in `dashboard/index.ts` filters by the authenticated `clerk_user_id`. Service role bypasses RLS, so a missing `.eq("user_id", ...)` clause is the worst-case bug — CI grep checks guard against this.
3. **RLS as defense in depth.** Every table has restrictive deny-all policies for `anon` and `authenticated` roles; only the service role can read/write.

Customer secrets:
- AnveGuard API keys (`ag_live_*`) are stored as **SHA-256 hashes** — never plaintext after creation.
- Upstream provider keys (e.g., your OpenAI key) are encrypted with **AES-GCM**. The encryption key is derived from `KEY_ENCRYPTION_SECRET`. *Per-user key derivation is on the roadmap (issue: H2 in audit plan).*

Logging:
- Request and response payloads are stored in `request_logs` to power audit and policy tuning.
- Operators can configure per-workspace log payload mode (full / metadata-only / redacted) — *defaulting to metadata-only is on the roadmap (issue: C3 in audit plan).*

For known limitations and the active hardening roadmap, see the audit plan referenced in `CONTRIBUTING.md`.

## Responsible disclosure

We commit to:
- Not pursuing legal action against good-faith research that respects this policy
- Crediting reporters in release notes (or anonymously, if preferred)
- Publishing a post-mortem for any user-impacting incident
