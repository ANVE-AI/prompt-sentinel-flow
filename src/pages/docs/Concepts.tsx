import { DocPage, H2, P, Lead, UL, Table, CrumbLink } from "./DocsLayout";

const Concepts = () => (
  <DocPage
    eyebrow="Introduction · Concepts"
    title="Concepts"
    lede="The five primitives that make up AnveGuard. Once these click, the rest of the docs read fast."
  >
    <Lead>
      AnveGuard is intentionally small. Five objects cover everything you can configure;
      every other surface — the dashboard, the proxy, the audit log — is a view over them.
    </Lead>

    <Table
      headers={["Object", "What it does"]}
      rows={[
        [<strong key="e">Endpoint</strong>, "An upstream provider you can call. Holds base URL, kind, and the encrypted upstream credential."],
        [<strong key="k">API key</strong>, "A credential your app uses to talk to AnveGuard. Bound to one endpoint by default."],
        [<strong key="a">Alias</strong>, "A nickname (e.g. fast) that rewrites to a real model on a specific key."],
        [<strong key="r">Route</strong>, "An ordered fallback chain across endpoints. Triggered with route:<name> as the model."],
        [<strong key="p">Policy</strong>, "Allow/blocklist rules applied to prompts and responses before they leave AnveGuard."],
      ]}
    />

    <H2 id="request-lifecycle">Request lifecycle</H2>
    <P>
      Every call goes through the same pipeline. Knowing the order matters when something
      gets blocked or routed unexpectedly.
    </P>
    <UL>
      <li><strong>Authenticate</strong> — verify the AnveGuard key, look up its endpoint.</li>
      <li><strong>Resolve model</strong> — apply alias rewrites; if the model is <code>route:…</code>, expand to a chain.</li>
      <li><strong>Policy: input</strong> — run blocked/allowed keyword checks on the prompt.</li>
      <li><strong>Forward</strong> — call the upstream with its credential. Stream or buffer.</li>
      <li><strong>Policy: output</strong> — re-check the assistant's reply.</li>
      <li><strong>Log</strong> — persist a row with status, tokens, latency, and payloads.</li>
    </UL>

    <H2 id="multi-tenancy">Workspace boundaries</H2>
    <P>
      Every object is scoped to a single workspace. Sharing happens via explicit
      endpoint shares — see <CrumbLink to="/docs/endpoints">Endpoints</CrumbLink>.
    </P>

    <H2 id="naming">Naming conventions</H2>
    <UL>
      <li>API keys are prefixed <code>ag_live_</code> followed by 32 random characters.</li>
      <li>Aliases are case-insensitive; they only rewrite when the request <em>exactly</em> equals the alias.</li>
      <li>Routes are addressed as <code>route:&lt;name&gt;</code> in the request body's <code>model</code> field.</li>
    </UL>
  </DocPage>
);

export default Concepts;
