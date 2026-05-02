import { DocPage, H2, P, Lead, Pre, Table } from "./DocsLayout";

const Errors = () => (
  <DocPage
    eyebrow="Reference · Errors"
    title="Errors"
    lede="AnveGuard returns OpenAI-shaped error bodies so your existing error handling keeps working."
  >
    <H2 id="shape">Error shape</H2>
    <Lead>
      All errors — whether they originate in AnveGuard or are forwarded from upstream —
      come back in the same shape:
    </Lead>
    <Pre language="json">{`{
  "error": {
    "message": "Human-readable explanation.",
    "type": "policy_blocked",
    "code": "blocked_input"
  }
}`}</Pre>

    <H2 id="codes">Error codes</H2>
    <Table
      headers={["HTTP", "code", "When"]}
      rows={[
        ["400", "blocked_input", "Prompt matched a blocked keyword."],
        ["400", "blocked_output", "Response matched a blocked keyword."],
        ["400", "invalid_request", "Malformed body or missing required fields."],
        ["401", "invalid_api_key", "Key missing, malformed, or revoked."],
        ["404", "not_proxied", "Path is not yet supported by AnveGuard."],
        ["404", "route_not_found", "Used route:<name> but the route doesn't exist."],
        ["429", "upstream_rate_limited", "Upstream rate-limited and no fallback succeeded."],
        ["502", "upstream_error", "Upstream returned a 5xx and no fallback succeeded."],
        ["504", "upstream_timeout", "All route steps exceeded their timeout."],
      ]}
    />

    <H2 id="retries">When to retry</H2>
    <P>
      Retry safely on <code>429</code>, <code>502</code>, and <code>504</code>. Do not
      retry <code>400</code> or <code>401</code> — they will fail again with the same
      input. Honor any <code>Retry-After</code> header if present.
    </P>

    <H2 id="debugging">Debugging</H2>
    <P>
      Every error is logged with the upstream response and timing data. Open the request
      in the dashboard to see exactly what happened.
    </P>
  </DocPage>
);

export default Errors;
