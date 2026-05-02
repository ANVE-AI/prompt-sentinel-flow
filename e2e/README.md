# Browser End-to-End Tests

Playwright-based E2E tests that sign in via Clerk and exercise the dashboard.

## What's covered

| Spec | Covers |
|---|---|
| `01-navigation.spec.ts` | Every sidebar route loads its H1; no console errors |
| `02-logs-audit.spec.ts` | Logs page **Requests** + **Audit log** tabs, status/action filters refetch with the right query params, audit detail sheet opens |
| `03-keys.spec.ts` | API Keys list, "New key" dialog opens, replacement-key deep link (`?new=1&name=…&endpoint=…`) prefills name + binding banner |
| `04-endpoints.spec.ts` | Endpoints list, usage dialog 1h/24h/7d/30d/90d/all presets fire `endpoint_usage` with the right `range`, revoke confirm dialog shows last-used / last-model and the "Create replacement key" shortcut (cancel only — no destructive click) |
| `05-policies.spec.ts` | Policies load via `get_policies`, switch round-trips through `save_policies` and is restored |

Tests are read-only or self-restoring. They never click destructive actions (Revoke, Delete) in CI.

## One-time setup

```bash
# Install Playwright browsers (one-time per machine)
npx playwright install chromium

# Configure environment
cp .env.e2e.example .env.e2e
# edit E2E_BASE_URL (defaults to the deployed Lovable preview)
```

## Authenticate (pick one strategy)

### A. Manual (recommended for Clerk dev instances)

```bash
npm run e2e:codegen
```

A browser opens. Sign in normally (Google, email, etc.). Close the window.
The session is saved to `playwright/.auth/user.json` and reused by all tests.

### B. Programmatic (requires a test user)

Set `E2E_CLERK_USER`, `E2E_CLERK_PASSWORD`, and `CLERK_SECRET_KEY` in
`.env.e2e`, then:

```bash
npm run e2e:auth
```

## Run

```bash
npm run e2e             # headless
npm run e2e:headed      # see the browser
npm run e2e:ui          # interactive mode
npm run e2e:report      # open last HTML report
```

## Tips

- If a spec fails with **"Not signed in"**, your storage state expired —
  re-run `npm run e2e:codegen`.
- Specs that depend on account data (endpoints with bound keys, audit
  history) auto-`skip` when the data isn't there, so a fresh tenant still
  passes the suite.
- HTML report at `playwright-report/index.html` after each run.
