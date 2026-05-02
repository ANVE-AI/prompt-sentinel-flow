import { DocPage, H2, P, Lead, UL, Pre, Table, Callout, CrumbLink } from "./DocsLayout";

const Endpoints = () => (
  <DocPage
    eyebrow="Guides · Endpoints"
    title="Endpoints & providers"
    lede="An endpoint is one upstream provider AnveGuard can call. Define them once, then point as many keys at them as you want."
  >
    <H2 id="kinds">Supported provider kinds</H2>
    <Lead>
      AnveGuard speaks several provider dialects natively and translates everything to the
      OpenAI Chat Completions shape on the way out so your application code stays the
      same.
    </Lead>
    <Table
      headers={["Kind", "Use for", "Auth"]}
      rows={[
        ["openai", "OpenAI, OpenRouter, Together, Groq, Fireworks, Lovable AI Gateway", "Bearer"],
        ["anthropic", "Anthropic Claude (anthropic_messages format)", "x-api-key header"],
        ["google", "Google Gemini (REST)", "Query string key"],
        ["openai_compatible", "Self-hosted llama.cpp / vLLM / Ollama / TGI", "Configurable"],
      ]}
    />

    <H2 id="creating">Creating an endpoint</H2>
    <P>
      In <CrumbLink to="/dashboard/endpoints">Endpoints</CrumbLink>, click <em>New
      endpoint</em>, pick a kind, and paste the upstream credential. AnveGuard stores it
      encrypted with AES-GCM and never returns it to the dashboard.
    </P>
    <Pre language="json">{`{
  "name": "OpenAI prod",
  "kind": "openai",
  "base_url": "https://api.openai.com/v1",
  "default_model": "gpt-4o-mini",
  "model_suggestions": ["gpt-4o-mini", "gpt-4o", "o3-mini"]
}`}</Pre>

    <H2 id="custom">Custom OpenAI-compatible endpoints</H2>
    <P>
      For self-hosted or niche providers, choose <em>openai_compatible</em> and override
      the path/header conventions:
    </P>
    <UL>
      <li><strong>Base URL</strong> — root of the API, with no trailing slash.</li>
      <li><strong>Chat path</strong> — defaults to <code>/chat/completions</code>.</li>
      <li><strong>Models path</strong> — defaults to <code>/models</code>.</li>
      <li><strong>Auth header / scheme</strong> — for providers that don't use Bearer.</li>
      <li><strong>Extra headers</strong> — JSON map merged into every request.</li>
    </UL>

    <H2 id="providers-page">Providers overview</H2>
    <P>
      The <CrumbLink to="/dashboard/providers">Providers</CrumbLink> page groups your
      endpoints by kind and surfaces request volume and error rate per provider. Useful
      when you want to see at a glance which upstream is causing pain.
    </P>

    <H2 id="sharing">Sharing endpoints</H2>
    <Callout kind="note">
      Endpoint shares let teammates re-use an upstream credential without seeing the
      underlying key. Pending shares match by email and resolve once the recipient signs in.
    </Callout>
  </DocPage>
);

export default Endpoints;
