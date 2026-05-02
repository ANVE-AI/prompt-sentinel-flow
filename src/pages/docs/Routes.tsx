import { DocPage, H2, P, Lead, UL, Pre, Table, Callout, CrumbLink } from "./DocsLayout";

const Routes = () => (
  <DocPage
    eyebrow="Guides · Routes"
    title="Routes & fallbacks"
    lede="A route is a named, ordered fallback chain across endpoints. Use them to keep your application up when an upstream rate-limits, errors, or stalls."
  >
    <H2 id="model-syntax">Calling a route</H2>
    <Lead>
      Send the route name as the <code>model</code>, prefixed with <code>route:</code>:
    </Lead>
    <Pre language="json">{`{
  "model": "route:production-chat",
  "messages": [{ "role": "user", "content": "..." }]
}`}</Pre>

    <H2 id="defining">Defining a chain</H2>
    <P>
      In <CrumbLink to="/dashboard/routes">Routes</CrumbLink>, create a route and add
      ordered steps. Each step is an <code>(endpoint, model)</code> pair. AnveGuard tries
      step 1; if it qualifies for fallback, it tries step 2, and so on.
    </P>

    <H2 id="triggers">Fallback triggers</H2>
    <Table
      headers={["Trigger", "Default", "Behavior"]}
      rows={[
        ["fallback_on_5xx", "on", "Fall through on any HTTP 5xx from upstream."],
        ["fallback_on_429", "on", "Fall through on rate-limit responses."],
        ["fallback_on_timeout", "off", "Abort step after timeout_ms and try next step."],
      ]}
    />

    <H2 id="timeouts">Per-step timeout</H2>
    <P>
      <code>timeout_ms</code> applies to each individual step, not the entire route. A
      three-step route with a 30s timeout can take up to 90s in the worst case.
    </P>

    <H2 id="logging">What gets logged</H2>
    <P>
      Each route attempt is recorded as one log row, with the chosen model and the failure
      reason if any. The user-visible status reflects whichever step finally succeeded.
    </P>

    <Callout kind="tip" title="Common pattern">
      Put your fast/cheap model first and your premium model second. You'll save on the
      common case and only pay for the strong model when the cheap one rate-limits.
    </Callout>

    <H2 id="anti-patterns">Anti-patterns</H2>
    <UL>
      <li>Don't enable timeout-fallback with a tight budget on streaming routes — first-token latency varies wildly.</li>
      <li>Don't chain identical endpoints; rate-limits affect them together.</li>
      <li>Routes don't retry the same step. Use a longer timeout if transient retries are what you want.</li>
    </UL>
  </DocPage>
);

export default Routes;
