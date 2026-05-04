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

    <H2 id="token-spike-alerts">Token spike alerts</H2>
    <Lead>
      AnveGuard watches <code>tokens_in</code> and <code>tokens_out</code> per workspace
      and surfaces an alert banner on the Overview dashboard when the current window
      deviates sharply from baseline. Use it to catch runaway prompts, prompt-injection
      loops, or unexpected batch jobs before they hit your bill.
    </Lead>
    <UL>
      <li><strong>Configurable thresholds</strong> — set absolute floors and a multiplier vs. baseline for both input and output tokens.</li>
      <li><strong>Time-range aware</strong> — the alert banner shows the anomaly rate vs. the average for the dashboard time range you're viewing (7/30/90d).</li>
      <li><strong>Notifications</strong> — opt in to email notifications when a spike fires so you hear about it even when no one is watching the tab.</li>
    </UL>

    <H2 id="severity-score">Anomaly severity score</H2>
    <P>
      Every spike is scored 0–100 based on how far the current window deviates from a
      rolling baseline. The score is volume-aware: a 10× ratio on tiny traffic gets
      dampened, while sustained deviation on large volumes scores higher.
    </P>
    <UL>
      <li><strong>Baseline window (days)</strong> — how much history to average against. Longer windows smooth out daily seasonality.</li>
      <li><strong>Volume dampening (0–1)</strong> — how aggressively to discount low-volume spikes. <code>1.0</code> means no dampening.</li>
      <li><strong>Score cap (1–100)</strong> — the maximum severity any single window can reach. Lower it to keep alerts comparable across workloads.</li>
    </UL>
    <P>
      All three live under <CrumbLink to="/dashboard/policies">Policies → Token alerts</CrumbLink>
      so you can calibrate the score to your traffic shape without redeploying.
    </P>

    <Callout kind="tip" title="Start permissive, then tighten">
      Most teams start with the defaults (7-day baseline, 0.6 dampening, cap 100) and tune
      the multiplier down once they've seen a week of real traffic.
    </Callout>
  </DocPage>
);

export default Policies;
