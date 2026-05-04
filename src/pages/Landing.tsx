import { Link } from "react-router-dom";
import { ArrowRight, Github, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { CodeTabs } from "@/components/landing/CodeTabs";

/**
 * Landing page — YC-style "high-signal, low-decoration" layout.
 *
 * Design rules followed throughout:
 *  - One accent color (primary). No gradients, no glows, no scanlines.
 *  - Monospace eyebrows for section labels; tight, large display headings.
 *  - Real content (numbers, snippets, prose) over visual flourishes.
 *  - Thin 1px borders separate sections; no card shadows.
 *  - Mobile-first: every section has px-4 md:px-6 padding and stacks cleanly.
 *
 * Sections, in order:
 *   1. Top bar               – brand, in-page nav, sign-in / get-started
 *   2. Hero                  – headline, subhead, CTA, stat strip
 *   3. Drop-in snippet       – "change one URL" code tabs
 *   4. What it does          – three columns: Inspect / Enforce / Audit
 *   5. How it works          – numbered three-step prose
 *   6. Quote                 – single operator quote, dense prose
 *   7. FAQ                   – four common operator questions
 *   8. CTA                   – flat dark band, two buttons
 *   9. Footer                – brand, status, links
 */

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#observability", label: "Observability" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
];

const STATS: { value: string; label: string }[] = [
  { value: "<5ms", label: "Median proxy overhead" },
  { value: "100%", label: "OpenAI-API compatible" },
  { value: "4", label: "Providers supported" },
  { value: "1", label: "Line of code to install" },
];

const PILLARS: { eyebrow: string; title: string; body: string; bullets: string[] }[] = [
  {
    eyebrow: "01 / Inspect",
    title: "Every prompt and response, searchable.",
    body: "A live request log with status, latency, model, key, and the full payload — plus token spike alerts with a calibratable severity score so anomalies surface early.",
    bullets: ["Live tail with auto-refresh", "Token spike alerts (in/out)", "Severity score 0–100"],
  },
  {
    eyebrow: "02 / Enforce",
    title: "Policies that run before the request leaves.",
    body: "Allow/blocklists and a custom block message. Update in the dashboard — no redeploy, no SDK upgrade.",
    bullets: ["Keyword & regex rules", "Per-key or workspace-wide", "Custom block response"],
  },
  {
    eyebrow: "03 / Audit",
    title: "An immutable trail of everything that changed.",
    body: "Key creation, revocation, policy edits, endpoint changes — captured with actor, timestamp, and metadata.",
    bullets: ["Compliance-ready format", "Filter by actor or action", "Export via the dashboard API"],
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Issue a key",
    body: "Create an AnveGuard key in the dashboard. Bind it to OpenAI, Anthropic, Lovable AI, or any OpenAI-compatible endpoint you already use.",
  },
  {
    n: "02",
    title: "Swap the URL",
    body: "Point your existing OpenAI client at the AnveGuard base URL and use the AnveGuard key. Your provider key never leaves the dashboard.",
  },
  {
    n: "03",
    title: "Watch and govern",
    body: "Logs stream live. Policies enforce automatically. Rotate, revoke, or change rules from the console — code stays untouched.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need to change my code?",
    a: "Only the base URL and the API key. Anything that speaks the OpenAI Chat Completions API works without further changes — including the official OpenAI SDKs in Python, Node, and Go.",
  },
  {
    q: "Where does my provider key live?",
    a: "Encrypted in the dashboard, never shipped to your client or runtime. Your application only ever holds an AnveGuard key, which you can rotate or revoke instantly.",
  },
  {
    q: "What's the latency overhead?",
    a: "Median added latency is under 5ms in the same region. Streaming responses are forwarded chunk-by-chunk, so time-to-first-token is preserved.",
  },
  {
    q: "Is it free to start?",
    a: "Yes. The free tier covers everything most teams need to evaluate AnveGuard end-to-end, including policies, audit logs, and the request explorer.",
  },
];

const Landing = () => (
  <div className="min-h-screen bg-background text-foreground antialiased">
    {/* ------------------------------- Top bar ------------------------------ */}
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-12 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-6 text-meta text-muted-foreground">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="hover:text-foreground transition-colors">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/sign-up">
              Get started <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>

    {/* --------------------------------- Hero -------------------------------- */}
    {/* Plain background, centered text, real CTA. No decorative diagram —
        the snippet section directly below carries that role. */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 pt-20 pb-14 lg:pt-28 lg:pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border surface-2 px-2.5 py-1 text-meta text-muted-foreground font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-status-ok" />
          <span>v1 · Drop-in for the OpenAI API</span>
        </div>
        <h1 className="mt-6 text-display lg:text-display-xl font-semibold tracking-tight leading-[1.04]">
          The control layer between<br className="hidden sm:block" /> your app and every AI model.
        </h1>
        <p className="mt-5 text-body lg:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
          AnveGuard is a drop-in proxy for the OpenAI Chat Completions API.
          Inspect every request, enforce policies before they reach a provider,
          and audit usage from a single console.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Button size="lg" asChild>
            <Link to="/sign-up">
              Start free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#how">See how it works</a>
          </Button>
        </div>
        <p className="mt-4 text-meta text-muted-foreground">
          Free tier · No credit card · 2-minute setup
        </p>
      </div>

      {/* Stat strip — fixed numbers, monospace values, thin top border so it
          reads as part of the hero rather than a separate band. */}
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <dl className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {STATS.map((s) => (
              <div key={s.label} className="px-4 md:px-6 py-5 first:pl-0 last:pr-0">
                <dt className="text-meta font-mono uppercase tracking-[0.12em] text-muted-foreground">
                  {s.label}
                </dt>
                <dd className="mt-1 text-display font-semibold tabular-nums tracking-tight">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>

    {/* ----------------------- Drop-in snippet section ---------------------- */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 lg:py-20">
        <div className="text-center mb-8">
          <div className="text-meta uppercase tracking-[0.18em] text-muted-foreground font-mono">
            Change one URL
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            No SDK. No code rewrites.
          </h2>
          <p className="mt-3 text-body text-muted-foreground max-w-xl mx-auto">
            Point any OpenAI client at AnveGuard and use an AnveGuard key.
            That's it — keep your existing libraries and patterns.
          </p>
        </div>
        <CodeTabs />
      </div>
    </section>

    {/* ----------------------- What it does (3 pillars) --------------------- */}
    <section id="product" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
            Product
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            Inspect, enforce, and audit — in one place.
          </h2>
        </div>
        <div className="mt-10 grid md:grid-cols-3 border-t border-border">
          {PILLARS.map((p, i) => (
            <div
              key={p.eyebrow}
              className={`py-7 md:py-8 md:px-7 ${i > 0 ? "border-t md:border-t-0 md:border-l border-border" : "md:pl-0"} ${i === PILLARS.length - 1 ? "md:pr-0" : ""}`}
            >
              <div className="text-meta font-mono text-muted-foreground">{p.eyebrow}</div>
              <h3 className="mt-3 text-h1 font-medium tracking-tight">{p.title}</h3>
              <p className="mt-2 text-body text-muted-foreground leading-relaxed">{p.body}</p>
              <ul className="mt-5 space-y-2">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-meta text-muted-foreground">
                    <Check className="h-3.5 w-3.5 mt-[2px] text-primary shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ---------------------------- How it works ---------------------------- */}
    <section id="how" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
            How it works
          </div>
          <h2 className="mt-2 text-display font-semibold tracking-tight">
            Three steps. No infrastructure to manage.
          </h2>
        </div>
        <ol className="mt-10 grid md:grid-cols-3 gap-px bg-border">
          {STEPS.map((s) => (
            <li key={s.n} className="surface-1 p-6 md:p-7">
              <div className="text-meta font-mono text-muted-foreground">{s.n}</div>
              <div className="mt-3 text-h1 font-medium tracking-tight">{s.title}</div>
              <p className="mt-2 text-body text-muted-foreground leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>

    {/* -------------------------------- Quote -------------------------------- */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 lg:py-20">
        <p className="text-h1 lg:text-display font-medium tracking-tight leading-snug">
          “We replaced a homegrown logging proxy and three Notion docs of
          ‘please don't paste customer data into prompts’ with a single
          AnveGuard endpoint. Setup took an afternoon.”
        </p>
        <div className="mt-6 flex items-center gap-3 text-meta text-muted-foreground font-mono">
          <span className="h-6 w-6 rounded-full bg-primary/15 border border-primary/30" />
          <span className="text-foreground">Engineering lead</span>
          <span>·</span>
          <span>Series A SaaS, 40 engineers</span>
        </div>
      </div>
    </section>

    {/* --------------------------------- FAQ -------------------------------- */}
    <section id="faq" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-16 lg:py-20">
        <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">
          FAQ
        </div>
        <h2 className="mt-2 text-display font-semibold tracking-tight">
          Common questions.
        </h2>
        <dl className="mt-10 divide-y divide-border border-y border-border">
          {FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="text-h2 font-medium tracking-tight">{f.q}</dt>
              <dd className="mt-2 text-body text-muted-foreground leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>

    {/* --------------------------------- CTA -------------------------------- */}
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-20 text-center">
        <h2 className="text-display lg:text-display-lg font-semibold tracking-tight">
          Ship AI features with a control layer from day one.
        </h2>
        <p className="mt-3 text-body text-muted-foreground">
          Free to start. Pay only when you scale beyond the free tier.
        </p>
        <div className="mt-7 flex items-center justify-center gap-2.5">
          <Button size="lg" asChild>
            <Link to="/sign-up">
              Create your first key <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              <Github className="mr-2 h-4 w-4" /> GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>

    {/* ------------------------------- Footer ------------------------------- */}
    <footer>
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-14 flex items-center justify-between text-meta text-muted-foreground">
        <div className="flex items-center gap-3">
          <Logo size={20} />
          <span>© {new Date().getFullYear()} AnveGuard</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-status-ok live-pulse" />
          All systems operational
        </div>
      </div>
    </footer>
  </div>
);

export default Landing;
