import { DocPage, H2, P, Lead, UL, Pre, Callout, CrumbLink } from "./DocsLayout";

const Overview = () => (
  <DocPage
    eyebrow="Introduction · Overview"
    title="AnveGuard"
    lede="A drop-in proxy for the OpenAI API that lets you inspect, govern, and audit every LLM call your team makes — without changing your application code."
  >
    <Lead>
      Point your existing SDK at AnveGuard's base URL and you immediately get a searchable
      request log, keyword policies enforced before requests leave your network, fallback
      routes between providers, and an immutable audit trail of every change.
    </Lead>

    <H2 id="why">Why AnveGuard</H2>
    <P>
      Most teams ship LLM features with no central record of what was sent, what came back,
      or who could change the rules. AnveGuard gives you the missing operational layer in
      under a minute and stays out of your way once it's in.
    </P>
    <UL>
      <li><strong>Drop-in.</strong> Change one base URL. No SDK upgrades, no wrappers.</li>
      <li><strong>Multi-provider.</strong> OpenAI, Anthropic, Google, and any OpenAI-compatible endpoint.</li>
      <li><strong>Governable.</strong> Per-key policies, model aliases, and fallback chains — managed in the dashboard.</li>
      <li><strong>Observable.</strong> Token spike alerts with a calibratable severity score so anomalies surface before they hit the bill.</li>
      <li><strong>Auditable.</strong> Every request and admin action is logged with actor, timestamp, and payload.</li>
    </UL>

    <H2 id="how-it-fits">How it fits in your stack</H2>
    <P>
      AnveGuard sits between your application and your model provider. Your code keeps
      using the OpenAI SDK; AnveGuard handles authentication, policy enforcement, model
      routing, and logging server-side.
    </P>
    <Pre language="text">{`┌─────────────┐   AnveGuard key   ┌────────────┐   provider key   ┌──────────┐
│  Your app   │ ────────────────► │ AnveGuard  │ ───────────────► │ OpenAI   │
└─────────────┘                   │   proxy    │                  │ Anthropic│
                                  └────────────┘                  │ Google   │
                                       │                          └──────────┘
                                       ▼
                                 logs · policies
                                 routes · audit`}</Pre>

    <H2 id="next">Next steps</H2>
    <P>
      Start with <CrumbLink to="/docs/quickstart">Quickstart</CrumbLink> to wire up your
      first request, then read <CrumbLink to="/docs/concepts">Concepts</CrumbLink> for the
      mental model.
    </P>

    <Callout kind="tip" title="In a hurry?">
      You can be sending real requests through AnveGuard in under three minutes. The
      Quickstart is genuinely that short.
    </Callout>
  </DocPage>
);

export default Overview;
