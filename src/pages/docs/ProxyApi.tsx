import { DocPage, H2, P, Lead, UL, Pre, Table, Callout } from "./DocsLayout";

const ProxyApi = () => (
  <DocPage
    eyebrow="Reference · Proxy API"
    title="Proxy API"
    lede="AnveGuard exposes a strict subset of the OpenAI REST API. If your code talks to OpenAI today, it talks to AnveGuard tomorrow."
  >
    <H2 id="base">Base URL</H2>
    <Lead>
      <code>https://anveguard.app/v1</code>
    </Lead>

    <H2 id="auth">Authentication</H2>
    <P>
      Send your AnveGuard key as a Bearer token in the <code>Authorization</code> header.
      Anonymous requests get <code>401</code>.
    </P>
    <Pre language="http">{`POST /v1/chat/completions HTTP/1.1
Host: anveguard.app
Authorization: Bearer ag_live_…
Content-Type: application/json`}</Pre>

    <H2 id="endpoints">Endpoints</H2>
    <Table
      headers={["Method", "Path", "Notes"]}
      rows={[
        ["POST", "/v1/chat/completions", "Streaming and non-streaming. Mirrors OpenAI."],
        ["GET", "/v1/models", "Lists models reported by your endpoint."],
      ]}
    />

    <H2 id="model-resolution">Model resolution order</H2>
    <P>
      The <code>model</code> field is resolved in this order. The first match wins.
    </P>
    <UL>
      <li>Starts with <code>route:</code> → look up the named route on the workspace.</li>
      <li>Matches an alias on this key → rewrite to the alias's target.</li>
      <li>Otherwise → forward to the key's bound endpoint.</li>
    </UL>

    <H2 id="streaming">Streaming</H2>
    <P>
      Set <code>stream: true</code> as you would with OpenAI. AnveGuard relays
      Server-Sent Events with no buffering. Output policy checks run on the assembled
      transcript after the stream ends; if a violation is found, the final chunk includes
      a synthetic error and the request status is logged as <code>blocked_output</code>.
    </P>

    <H2 id="non-chat">Non-chat operations</H2>
    <Callout kind="note">
      Embeddings, images, audio, and the Responses API are on the roadmap but not yet
      proxied. Calls to those paths return <code>404 not_proxied</code>.
    </Callout>
  </DocPage>
);

export default ProxyApi;
