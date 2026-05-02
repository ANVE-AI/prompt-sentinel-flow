import { DocPage, H2, P, Lead, UL, Pre, Callout, CrumbLink } from "./DocsLayout";

const ApiKeys = () => (
  <DocPage
    eyebrow="Guides · API keys"
    title="API keys"
    lede="The credentials your application uses to talk to AnveGuard. Each key is bound to one endpoint and can carry its own alias map."
  >
    <H2 id="creating">Creating a key</H2>
    <Lead>
      Open <CrumbLink to="/dashboard/keys">API Keys</CrumbLink> and click <em>New key</em>.
      Pick the endpoint it should route to and a default model. The full key is shown once
      — store it in your secret manager immediately.
    </Lead>

    <Callout kind="warn" title="Shown once">
      AnveGuard stores only a hash of the key. We can revoke and re-issue, but we cannot
      recover a lost key.
    </Callout>

    <H2 id="using">Using a key</H2>
    <P>
      Pass the key as a Bearer token, identical to OpenAI:
    </P>
    <Pre language="bash">{`curl https://anveguard.app/v1/chat/completions \\
  -H "Authorization: Bearer ag_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'`}</Pre>

    <H2 id="aliases">Aliases</H2>
    <P>
      Each key can carry a map of model aliases. Use them to swap providers without
      touching application code:
    </P>
    <UL>
      <li><code>fast</code> → <code>gpt-4o-mini</code></li>
      <li><code>smart</code> → <code>claude-3-5-sonnet</code></li>
      <li><code>cheap</code> → <code>gemini-2.5-flash-lite</code></li>
    </UL>
    <P>
      Aliases only fire when the request's <code>model</code> field equals the alias
      exactly. They are scoped to the key — a different key can map the same nickname to
      something else.
    </P>

    <H2 id="rotation">Rotating keys</H2>
    <P>
      Create the new key first, deploy it to your application, then revoke the old one
      from the dashboard. Revoked keys return <code>401 invalid_api_key</code> immediately.
    </P>

    <H2 id="usage">Usage signals</H2>
    <P>
      The Keys page shows last-used timestamps and the request volume per key over the
      last 14 days. Use this to find dormant keys before rotating credentials.
    </P>
  </DocPage>
);

export default ApiKeys;
