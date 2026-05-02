import { DocPage, H2, P, Lead, Pre, Steps, Step, Callout, CrumbLink } from "./DocsLayout";

const Quickstart = () => (
  <DocPage
    eyebrow="Introduction · Quickstart"
    title="Quickstart"
    lede="Send your first request through AnveGuard in three minutes. No SDK changes — just a base URL and a key."
  >
    <H2 id="before">Before you begin</H2>
    <Lead>
      You need a running provider account (OpenAI, Anthropic, or any OpenAI-compatible
      endpoint) and an AnveGuard workspace. Sign in to the dashboard to create one if you
      haven't already.
    </Lead>

    <Steps>
      <Step n={1} title="Create an endpoint">
        <P>
          In the dashboard, go to <CrumbLink to="/dashboard/endpoints">Endpoints</CrumbLink>
          and add the upstream provider you want to proxy. AnveGuard stores the upstream
          credentials encrypted at rest — your application never sees them.
        </P>
      </Step>
      <Step n={2} title="Mint an API key">
        <P>
          In <CrumbLink to="/dashboard/keys">API Keys</CrumbLink>, create a new key bound to
          that endpoint. The key looks like <code>ag_live_…</code> and is shown once.
        </P>
        <Callout kind="warn">
          Treat AnveGuard keys like any production secret — they grant the same privileges
          as the upstream provider key behind them.
        </Callout>
      </Step>
      <Step n={3} title="Point your SDK at AnveGuard">
        <P>Replace the base URL. That's the entire integration.</P>
        <Pre language="python">{`from openai import OpenAI

client = OpenAI(
    api_key="ag_live_…",
    base_url="https://anveguard.app/v1",
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`}</Pre>
        <Pre language="typescript">{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "ag_live_…",
  baseURL: "https://anveguard.app/v1",
});

const resp = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});`}</Pre>
      </Step>
      <Step n={4} title="Watch it land">
        <P>
          Open <CrumbLink to="/dashboard/logs">Logs</CrumbLink>. You should see your
          request within a second or two with status, latency, model, and the full payload.
        </P>
      </Step>
    </Steps>

    <H2 id="next">Next</H2>
    <P>
      You're proxied. Now configure guardrails in <CrumbLink to="/docs/policies">Policies</CrumbLink>,
      add a fallback in <CrumbLink to="/docs/routes">Routes</CrumbLink>, or read about the
      data model in <CrumbLink to="/docs/concepts">Concepts</CrumbLink>.
    </P>
  </DocPage>
);

export default Quickstart;
