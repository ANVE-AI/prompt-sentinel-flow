import { DocPage, H2, P, Lead, UL, Table, CrumbLink } from "./DocsLayout";

const Logs = () => (
  <DocPage
    eyebrow="Guides · Logs & audit"
    title="Logs & audit"
    lede="Two streams: one row per request, one row per admin action. Both are queryable from the dashboard."
  >
    <H2 id="request-logs">Request logs</H2>
    <Lead>
      Every proxied call writes a row to the request log with the prompt, the response,
      and operational metadata. Open <CrumbLink to="/dashboard/logs">Logs</CrumbLink> to
      tail in real time.
    </Lead>
    <Table
      headers={["Field", "Description"]}
      rows={[
        ["status", "ok · error · blocked_input · blocked_output"],
        ["model", "Effective model after alias/route resolution"],
        ["provider", "Endpoint kind that handled the request"],
        ["latency_ms", "Time from receive to first response byte"],
        ["tokens_in / tokens_out", "Reported by upstream when available"],
        ["block_reason", "Matched keyword or upstream error message"],
        ["messages / response", "Full payloads for debugging"],
      ]}
    />

    <H2 id="filters">Filtering</H2>
    <UL>
      <li>By status — only failures, only blocks, only successes.</li>
      <li>By API key — narrow to a single application or environment.</li>
      <li>By time window — last hour, day, or 14 days.</li>
    </UL>

    <H2 id="audit-log">Audit log</H2>
    <P>
      Every admin action — key created, endpoint edited, policy saved, route step moved —
      is captured with actor, target, and a JSON metadata blob. The audit log is
      append-only and cannot be edited from the application.
    </P>

    <H2 id="retention">Retention</H2>
    <P>
      Request logs are retained for 30 days by default. Audit entries are retained for the
      lifetime of the workspace. Contact support if you need a different retention policy.
    </P>
  </DocPage>
);

export default Logs;
