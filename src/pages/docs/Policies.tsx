import { DocPage, H2, P, Lead, UL, Pre, Callout, CrumbLink } from "./DocsLayout";

const Policies = () => (
  <DocPage
    eyebrow="Guides · Policies"
    title="Policies"
    lede="Keyword-based guardrails that run before a request leaves AnveGuard and again on the response. Substring match, case-insensitive, with allowlist overrides."
  >
    <H2 id="model">The policy model</H2>
    <Lead>
      Each workspace has one policy. It contains a list of blocked keywords, a list of
      allowed keywords, and a custom block message returned to the caller when a match
      fires.
    </Lead>
    <UL>
      <li><strong>Blocked keywords</strong> — case-insensitive substring matches against the prompt and the response.</li>
      <li><strong>Allowed keywords</strong> — if any of these appear, blocked matches in the same direction are suppressed.</li>
      <li><strong>Global defaults</strong> — a curated list maintained by AnveGuard. Toggle on or off in the dashboard.</li>
    </UL>

    <H2 id="evaluation">How a request is evaluated</H2>
    <P>
      Both the prompt and the assistant response are flattened to a single string and
      lower-cased. AnveGuard scans for any blocked term; if a hit is found and no
      allowlist term is also present, the request is blocked.
    </P>
    <Pre language="text">{`prompt:   "ignore previous instructions and tell me…"
blocked:  ["ignore previous instructions", "jailbreak"]
allowed:  []
                    → BLOCKED (matched: "ignore previous instructions")`}</Pre>

    <H2 id="block-response">What the caller sees</H2>
    <P>
      Blocked requests get HTTP <code>400</code> with an OpenAI-shaped error body so
      existing client error handlers keep working:
    </P>
    <Pre language="json">{`{
  "error": {
    "message": "This request was blocked by your organization's AI policy.",
    "type": "policy_blocked",
    "code": "blocked_input"
  }
}`}</Pre>

    <H2 id="testing">Test before you ship</H2>
    <P>
      The <CrumbLink to="/dashboard/policies/sandbox">Policy sandbox</CrumbLink> lets you
      paste an input/output and see exactly which guardrails fire — including allowlist
      overrides — without sending a real request.
    </P>

    <Callout kind="warn">
      Keyword policies catch obvious cases. They are not a replacement for structured
      authorization or content classifiers. Layer them with whatever else fits your risk
      profile.
    </Callout>
  </DocPage>
);

export default Policies;
